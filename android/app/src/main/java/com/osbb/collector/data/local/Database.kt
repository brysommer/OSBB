package com.osbb.collector.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Update

@Entity(tableName = "meters")
data class MeterEntity(
    @PrimaryKey val meterId: String,
    val dahId: String,
    val name: String,
    val serialNumber: String?,
    val resourceType: String,
    val premisesId: String,
    val buildingNumber: String,
    val sectionNumber: String,
    val floor: Int?,
    val apartmentNumber: String,
    val previous: Double,
    val alreadyCollected: Boolean,
    val selfSubmitted: Double?,
    val complexId: String,
    val complexName: String,
    val period: String,
    val queueIndex: Int,
)

@Entity(tableName = "pending_readings")
data class PendingReadingEntity(
    @PrimaryKey val clientSyncId: String,
    val meterId: String,
    val previous: Double,
    val current: Double,
    val period: String,
    val createdAt: Long,
    val syncStatus: String, // PENDING / SYNCED / ERROR
    val errorMessage: String? = null,
)

@Dao
interface MeterDao {
    @Query("DELETE FROM meters WHERE complexId = :complexId AND buildingNumber = :building AND sectionNumber = :section")
    suspend fun clearSection(complexId: String, building: String, section: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<MeterEntity>)

    @Query(
        """
        SELECT * FROM meters
        WHERE complexId = :complexId AND buildingNumber = :building AND sectionNumber = :section
        ORDER BY queueIndex ASC
        """,
    )
    suspend fun listSection(complexId: String, building: String, section: String): List<MeterEntity>

    @Query("SELECT * FROM meters WHERE meterId = :meterId LIMIT 1")
    suspend fun byId(meterId: String): MeterEntity?

    @Query("SELECT COUNT(*) FROM meters")
    suspend fun count(): Int
}

@Dao
interface PendingReadingDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: PendingReadingEntity)

    @Update
    suspend fun update(item: PendingReadingEntity)

    @Query("SELECT * FROM pending_readings WHERE syncStatus IN ('PENDING', 'ERROR') ORDER BY createdAt ASC")
    suspend fun pending(): List<PendingReadingEntity>

    @Query("SELECT COUNT(*) FROM pending_readings WHERE syncStatus IN ('PENDING', 'ERROR')")
    suspend fun pendingCount(): Int

    @Query("SELECT * FROM pending_readings WHERE meterId = :meterId AND period = :period LIMIT 1")
    suspend fun forMeterPeriod(meterId: String, period: String): PendingReadingEntity?
}

@Database(
    entities = [MeterEntity::class, PendingReadingEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun meterDao(): MeterDao
    abstract fun pendingReadingDao(): PendingReadingDao
}
