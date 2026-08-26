package com.osbb.collector.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.osbb.collector.BuildConfig
import com.osbb.collector.data.prefs.SessionStore
import com.osbb.collector.data.repo.SyncRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

data class LoginUiState(
    val apiBase: String = BuildConfig.DEFAULT_API_BASE,
    val telegramId: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
    val showServer: Boolean = false,
)

class LoginViewModel(
    private val repo: SyncRepository,
    private val sessionStore: SessionStore,
) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _state.update {
                it.copy(
                    apiBase = sessionStore.apiBase(),
                    telegramId = sessionStore.telegramId(),
                )
            }
        }
    }

    fun update(transform: (LoginUiState) -> LoginUiState) {
        _state.update(transform)
    }

    fun login() {
        val s = _state.value
        val telegramId = s.telegramId.trim().toLongOrNull()
        if (telegramId == null) {
            _state.update { it.copy(error = "Введіть свій Telegram ID числом") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                repo.login(s.apiBase, telegramId)
                _state.update { it.copy(loading = false, success = true) }
            } catch (e: HttpException) {
                val body = e.response()?.errorBody()?.string().orEmpty()
                val message = Regex("\"error\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.getOrNull(1)
                _state.update {
                    it.copy(
                        loading = false,
                        error = message ?: when (e.code()) {
                            403 -> "Немає доступу для цього Telegram ID"
                            else -> "Помилка входу (${e.code()})"
                        },
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(loading = false, error = e.message ?: "Немає звʼязку з сервером")
                }
            }
        }
    }

    companion object {
        fun factory(repo: SyncRepository, store: SessionStore) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return LoginViewModel(repo, store) as T
            }
        }
    }
}

@Composable
fun LoginScreen(viewModel: LoginViewModel, onLoggedIn: () -> Unit) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.success) {
        if (state.success) onLoggedIn()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("OSBB — офлайн збір", style = MaterialTheme.typography.headlineSmall)
        Text("Введіть свій Telegram ID — права підтягнуться з бази, як у боті.")

        OutlinedTextField(
            value = state.telegramId,
            onValueChange = { v -> viewModel.update { it.copy(telegramId = v) } },
            label = { Text("Telegram ID") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        Button(
            onClick = {
                viewModel.update { it.copy(showServer = !it.showServer) }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (state.showServer) "Сховати адресу сервера" else "Адреса сервера")
        }

        if (state.showServer) {
            OutlinedTextField(
                value = state.apiBase,
                onValueChange = { v -> viewModel.update { it.copy(apiBase = v) } },
                label = { Text("API URL") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            Text(
                "Емулятор: http://10.0.2.2:8787/\nТелефон: http://IP-сервера:8787/",
                style = MaterialTheme.typography.bodySmall,
            )
        }

        if (state.error != null) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
        }

        Button(
            onClick = viewModel::login,
            enabled = !state.loading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.loading) CircularProgressIndicator() else Text("Увійти")
        }
    }
}
