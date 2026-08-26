package com.osbb.collector.data

import android.content.Context
import androidx.room.Room
import com.osbb.collector.data.local.AppDatabase
import com.osbb.collector.data.prefs.SessionStore
import com.osbb.collector.data.remote.MobileApiFactory
import com.osbb.collector.data.repo.SyncRepository

class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    val sessionStore = SessionStore(appContext)

    val db: AppDatabase = Room.databaseBuilder(
        appContext,
        AppDatabase::class.java,
        "osbb-collector.db",
    ).fallbackToDestructiveMigration().build()

    val apiFactory = MobileApiFactory(sessionStore)

    val syncRepository = SyncRepository(
        apiFactory = apiFactory,
        sessionStore = sessionStore,
        meterDao = db.meterDao(),
        pendingDao = db.pendingReadingDao(),
    )
}
