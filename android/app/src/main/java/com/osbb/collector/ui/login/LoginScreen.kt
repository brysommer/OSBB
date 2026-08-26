package com.osbb.collector.ui.login

import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.Button
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.text.KeyboardOptions

data class LoginUiState(
    val apiBase: String = BuildConfig.DEFAULT_API_BASE,
    val apiKey: String = "",
    val telegramId: String = "",
    val name: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
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
                    apiKey = sessionStore.apiKey(),
                    telegramId = sessionStore.telegramId(),
                    name = sessionStore.userName(),
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
            _state.update { it.copy(error = "Введіть telegramId числом") }
            return
        }
        if (s.apiKey.isBlank()) {
            _state.update { it.copy(error = "Введіть MOBILE_API_KEY") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                repo.login(s.apiBase, s.apiKey.trim(), telegramId, s.name.trim())
                _state.update { it.copy(loading = false, success = true) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(loading = false, error = e.message ?: "Помилка входу")
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
        Text("OSBB — офлайн збір", style = androidx.compose.material3.MaterialTheme.typography.headlineSmall)
        Text("Увійдіть своїм Telegram ID (як у боті)")

        OutlinedTextField(
            value = state.apiBase,
            onValueChange = { v -> viewModel.update { it.copy(apiBase = v) } },
            label = { Text("API URL") },
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.apiKey,
            onValueChange = { v -> viewModel.update { it.copy(apiKey = v) } },
            label = { Text("MOBILE_API_KEY") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.telegramId,
            onValueChange = { v -> viewModel.update { it.copy(telegramId = v) } },
            label = { Text("Telegram ID") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.name,
            onValueChange = { v -> viewModel.update { it.copy(name = v) } },
            label = { Text("Імʼя (опційно)") },
            modifier = Modifier.fillMaxWidth(),
        )

        if (state.error != null) {
            Text(state.error!!, color = androidx.compose.material3.MaterialTheme.colorScheme.error)
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
