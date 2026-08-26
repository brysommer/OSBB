package com.osbb.collector

import android.app.Application
import com.osbb.collector.data.AppContainer

class CollectorApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
