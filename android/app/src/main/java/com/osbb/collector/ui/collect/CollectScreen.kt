package com.osbb.collector.ui.collect

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.osbb.collector.data.local.MeterEntity
import com.osbb.collector.data.repo.SyncRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CollectUiState(
    val queue: List<MeterEntity> = emptyList(),
    val index: Int = 0,
    val input: String = "",
    val message: String? = null,
    val error: String? = null,
    val finished: Boolean = false,
)

class CollectViewModel(
    private val repo: SyncRepository,
    private val complexId: String,
    private val building: String,
    private val section: String,
) : ViewModel() {
    private val _state = MutableStateFlow(CollectUiState())
    val state = _state.asStateFlow()

    init {
        reload()
    }

    fun reload() {
        viewModelScope.launch {
            val queue = repo.queue(complexId, building, section)
            _state.update {
                it.copy(
                    queue = queue,
                    index = 0,
                    input = queue.firstOrNull()?.selfSubmitted?.toString().orEmpty(),
                    finished = queue.isEmpty(),
                    message = if (queue.isEmpty()) "Немає лічильників — спочатку завантажте sync" else null,
                )
            }
        }
    }

    fun updateInput(value: String) {
        _state.update { it.copy(input = value, error = null) }
    }

    fun skip() {
        next()
    }

    fun save() {
        val s = _state.value
        val meter = s.queue.getOrNull(s.index) ?: return
        val current = s.input.trim().replace(',', '.').toDoubleOrNull()
        if (current == null) {
            _state.update { it.copy(error = "Введіть число") }
            return
        }
        if (current < meter.previous) {
            _state.update { it.copy(error = "Показник менший за попередній (${meter.previous})") }
            return
        }
        viewModelScope.launch {
            repo.saveLocalReading(meter, current)
            next()
        }
    }

    private fun next() {
        _state.update { state ->
            val nextIndex = state.index + 1
            if (nextIndex >= state.queue.size) {
                state.copy(finished = true, message = "Підʼїзд пройдено. Зробіть sync вивантаження.")
            } else {
                val next = state.queue[nextIndex]
                state.copy(
                    index = nextIndex,
                    input = next.selfSubmitted?.toString().orEmpty(),
                    error = null,
                    message = null,
                )
            }
        }
    }

    companion object {
        fun factory(
            repo: SyncRepository,
            complexId: String,
            building: String,
            section: String,
        ) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return CollectViewModel(repo, complexId, building, section) as T
            }
        }
    }
}

@Composable
fun CollectScreen(viewModel: CollectViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()
    val meter = state.queue.getOrNull(state.index)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        TextButton(onClick = onBack) { Text("← Назад") }

        if (state.finished || meter == null) {
            Text(state.message ?: "Готово")
            Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("До синхронізації")
            }
            return
        }

        Text("Обхід ${state.index + 1} / ${state.queue.size}")
        Text("Буд. ${meter.buildingNumber}, підʼїзд ${meter.sectionNumber}")
        Text("Поверх: ${meter.floor ?: "—"}")
        Text("Квартира: ${meter.apartmentNumber}", fontWeight = FontWeight.Bold)
        Text("Ресурс: ${resourceLabel(meter.resourceType)}")
        Text("Попередній: ${meter.previous}")
        if (meter.selfSubmitted != null) {
            Text("Самостійно подано: ${meter.selfSubmitted}")
        }

        OutlinedTextField(
            value = state.input,
            onValueChange = viewModel::updateInput,
            label = { Text("Новий показник") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.fillMaxWidth(),
        )

        if (state.error != null) {
            Text(state.error!!, color = androidx.compose.material3.MaterialTheme.colorScheme.error)
        }

        Button(onClick = viewModel::save, modifier = Modifier.fillMaxWidth()) {
            Text("Зберегти локально")
        }
        Button(onClick = viewModel::skip, modifier = Modifier.fillMaxWidth()) {
            Text("Пропустити")
        }
    }
}

private fun resourceLabel(type: String): String = when (type) {
    "COLD_WATER" -> "ХВ"
    "HOT_WATER" -> "ГВ"
    "ELECTRICITY" -> "ЕЕ"
    "HEATING" -> "ОП"
    else -> type
}
