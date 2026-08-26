package com.osbb.collector.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("session")

class SessionStore(private val context: Context) {
    private val tokenKey = stringPreferencesKey("token")
    private val apiBaseKey = stringPreferencesKey("api_base")
    private val telegramIdKey = stringPreferencesKey("telegram_id")
    private val userNameKey = stringPreferencesKey("user_name")

    val tokenFlow: Flow<String?> = context.dataStore.data.map { it[tokenKey] }

    suspend fun token(): String? = context.dataStore.data.first()[tokenKey]

    suspend fun apiBase(): String =
        context.dataStore.data.first()[apiBaseKey] ?: "http://10.0.2.2:8787/"

    suspend fun telegramId(): String = context.dataStore.data.first()[telegramIdKey] ?: ""

    suspend fun userName(): String = context.dataStore.data.first()[userNameKey] ?: ""

    suspend fun saveLogin(
        token: String,
        apiBase: String,
        telegramId: String,
        userName: String,
    ) {
        context.dataStore.edit {
            it[tokenKey] = token
            it[apiBaseKey] = apiBase.trimEnd('/') + "/"
            it[telegramIdKey] = telegramId
            it[userNameKey] = userName
        }
    }

    suspend fun clearToken() {
        context.dataStore.edit { it.remove(tokenKey) }
    }
}
