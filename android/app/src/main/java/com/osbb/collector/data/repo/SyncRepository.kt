package com.osbb.collector.data.repo

import com.osbb.collector.data.local.MeterDao
import com.osbb.collector.data.local.MeterEntity
import com.osbb.collector.data.local.PendingReadingDao
import com.osbb.collector.data.local.PendingReadingEntity
import com.osbb.collector.data.prefs.SessionStore
import com.osbb.collector.data.remote.LoginRequest
import com.osbb.collector.data.remote.MobileApiFactory
import com.osbb.collector.data.remote.PushReadingDto
import com.osbb.collector.data.remote.PushRequest
import java.util.UUID

data class SectionLocalStats(
    val metersTotal: Int,
    val metersTodo: Int,
    val pendingUpload: Int,
)

class SyncRepository(
    private val apiFactory: MobileApiFactory,
    private val sessionStore: SessionStore,
    private val meterDao: MeterDao,
    private val pendingDao: PendingReadingDao,
) {
    suspend fun login(apiBase: String, telegramId: Long) {
        sessionStore.saveLogin(
            token = "",
            apiBase = apiBase,
            telegramId = telegramId.toString(),
            userName = "",
        )
        val api = apiFactory.create(authRequired = false)
        val response = api.login(LoginRequest(telegramId = telegramId))
        sessionStore.saveLogin(
            token = response.token,
            apiBase = apiBase,
            telegramId = telegramId.toString(),
            userName = response.user.name.orEmpty(),
        )
    }

    suspend fun userName() = sessionStore.userName()

    suspend fun loadComplexes() = apiFactory.create().complexes()

    suspend fun loadStructure(complexId: String) = apiFactory.create().structure(complexId)

    suspend fun pull(complexId: String, building: String, section: String): Int {
        val snapshot = apiFactory.create().pull(complexId, building, section)
        meterDao.clearSection(complexId, building, section)
        val entities = snapshot.meters.mapIndexed { index, meter ->
            MeterEntity(
                meterId = meter.meterId,
                dahId = meter.dahId,
                name = meter.name,
                serialNumber = meter.serialNumber,
                resourceType = meter.resourceType,
                premisesId = meter.premisesId,
                buildingNumber = meter.buildingNumber,
                sectionNumber = meter.sectionNumber,
                floor = meter.floor,
                apartmentNumber = meter.apartmentNumber,
                previous = meter.previous,
                alreadyCollected = meter.alreadyCollected,
                selfSubmitted = meter.selfSubmitted,
                complexId = snapshot.complex.id,
                complexName = snapshot.complex.name,
                period = snapshot.period,
                queueIndex = index,
            )
        }
        meterDao.upsertAll(entities)
        sessionStore.saveLastSelection(complexId, building, section)
        return entities.size
    }

    suspend fun sectionStats(
        complexId: String,
        building: String,
        section: String,
    ): SectionLocalStats {
        val meters = meterDao.listSection(complexId, building, section)
        val todo = queue(complexId, building, section).size
        return SectionLocalStats(
            metersTotal = meters.size,
            metersTodo = todo,
            pendingUpload = pendingDao.pendingCount(),
        )
    }

    suspend fun queue(
        complexId: String,
        building: String,
        section: String,
        includeCollected: Boolean = false,
    ): List<MeterEntity> {
        return meterDao.listSection(complexId, building, section)
            .filter { includeCollected || !it.alreadyCollected }
            .filter { meter ->
                val local = pendingDao.forMeterPeriod(meter.meterId, meter.period)
                local == null || local.syncStatus == "ERROR"
            }
    }

    suspend fun saveLocalReading(meter: MeterEntity, current: Double) {
        val existing = pendingDao.forMeterPeriod(meter.meterId, meter.period)
        pendingDao.upsert(
            PendingReadingEntity(
                clientSyncId = existing?.clientSyncId ?: UUID.randomUUID().toString(),
                meterId = meter.meterId,
                previous = meter.previous,
                current = current,
                period = meter.period,
                createdAt = System.currentTimeMillis(),
                syncStatus = "PENDING",
                errorMessage = null,
            ),
        )
        meterDao.markCollected(meter.meterId)
    }

    suspend fun pendingCount() = pendingDao.pendingCount()

    suspend fun pushPending(): String {
        val pending = pendingDao.pending()
        if (pending.isEmpty()) return "Немає локальних показів для вивантаження"

        val response = apiFactory.create().push(
            PushRequest(
                period = pending.first().period,
                readings = pending.map {
                    PushReadingDto(
                        clientSyncId = it.clientSyncId,
                        meterId = it.meterId,
                        previous = it.previous,
                        current = it.current,
                    )
                },
            ),
        )

        val byId = response.results.associateBy { it.clientSyncId }
        for (item in pending) {
            val result = byId[item.clientSyncId]
            when (result?.status) {
                "created", "duplicate" -> {
                    pendingDao.update(item.copy(syncStatus = "SYNCED", errorMessage = null))
                }
                else -> {
                    pendingDao.update(
                        item.copy(
                            syncStatus = "ERROR",
                            errorMessage = result?.reason ?: "Помилка sync",
                        ),
                    )
                }
            }
        }

        return "Вивантажено: ${response.created}, дублікати: ${response.duplicates}, помилки: ${response.errors}"
    }

    suspend fun lastSelection(): Triple<String?, String?, String?> =
        Triple(sessionStore.lastComplexId(), sessionStore.lastBuilding(), sessionStore.lastSection())

    suspend fun rememberSelection(complexId: String, building: String, section: String) {
        sessionStore.saveLastSelection(complexId, building, section)
    }
}
