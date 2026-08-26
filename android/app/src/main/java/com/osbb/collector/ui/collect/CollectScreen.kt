package com.osbb.collector.ui.collect

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.unit.sp
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
    val confirmSuspicious: Boolean = false,
    val pendingValue: Double? = null,
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
                    message = if (queue.isEmpty()) {
                        "Немає лічильників для зняття. Спочатку «Завантажити підʼїзд»."
                    } else {
                        null
                    },
                    confirmSuspicious = false,
                    pendingValue = null,
                    error = null,
                )
            }
        }
    }

    fun updateInput(value: String) {
        _state.update {
            it.copy(input = value, error = null, confirmSuspicious = false, pendingValue = null)
        }
    }

    fun skip() {
        next()
    }

    fun acceptSelf() {
        val meter = _state.value.queue.getOrNull(_state.value.index) ?: return
        val self = meter.selfSubmitted ?: return
        viewModelScope.launch {
            repo.saveLocalReading(meter, self)
            next()
        }
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
            _state.update { it.copy(error = "Менше попереднього (${meter.previous})") }
            return
        }

        val diff = current - meter.previous
        val suspicious = meter.previous > 0 && diff > meter.previous * 2
        if (suspicious && !s.confirmSuspicious) {
            _state.update {
                it.copy(
                    confirmSuspicious = true,
                    pendingValue = current,
                    error = "Підозрілий стрибок: було ${meter.previous}, стало $current (Δ $diff). Підтвердіть.",
                )
            }
            return
        }

        viewModelScope.launch {
            repo.saveLocalReading(meter, current)
            next()
        }
    }

    fun confirmSuspiciousYes() {
        val value = _state.value.pendingValue ?: return
        val meter = _state.value.queue.getOrNull(_state.value.index) ?: return
        viewModelScope.launch {
            repo.saveLocalReading(meter, value)
            next()
        }
    }

    fun confirmSuspiciousNo() {
        _state.update {
            it.copy(confirmSuspicious = false, pendingValue = null, error = null, input = "")
        }
    }

    private fun next() {
        _state.update { state ->
            val nextIndex = state.index + 1
            if (nextIndex >= state.queue.size) {
                state.copy(
                    finished = true,
                    message = "Підʼїзд пройдено. Поверніться і натисніть «Вивантажити покази».",
                    confirmSuspicious = false,
                    pendingValue = null,
                    error = null,
                )
            } else {
                val next = state.queue[nextIndex]
                state.copy(
                    index = nextIndex,
                    input = next.selfSubmitted?.toString().orEmpty(),
                    error = null,
                    message = null,
                    confirmSuspicious = false,
                    pendingValue = null,
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
    val progress =
        if (state.queue.isEmpty()) 0f
        else (state.index.toFloat() / state.queue.size.toFloat()).coerceIn(0f, 1f)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        TextButton(onClick = onBack) { Text("← Назад") }

        if (state.finished || meter == null) {
            Text(state.message ?: "Готово", fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = onBack,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
            ) {
                Text("До вивантаження", fontSize = 18.sp)
            }
            return
        }

        Text("${state.index + 1} / ${state.queue.size}", fontSize = 16.sp)
        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())

        Text(
            "Поверх ${meter.floor ?: "—"}  ·  кв. ${meter.apartmentNumber}",
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(resourceLabel(meter.resourceType), fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Text("Буд. ${meter.buildingNumber}, підʼїзд ${meter.sectionNumber}")
        Text("Попередній: ${meter.previous}", fontSize = 18.sp)

        if (meter.selfSubmitted != null) {
            Text("Мешканець подав: ${meter.selfSubmitted}", fontSize = 18.sp)
            Button(
                onClick = viewModel::acceptSelf,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            ) {
                Text("Прийняти самостійний", fontSize = 17.sp)
            }
        }

        OutlinedTextField(
            value = state.input,
            onValueChange = viewModel::updateInput,
            label = { Text("Новий показник") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.fillMaxWidth(),
            textStyle = MaterialTheme.typography.headlineSmall,
            singleLine = true,
        )

        if (state.error != null) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error, fontSize = 16.sp)
        }

        if (state.confirmSuspicious) {
            Button(
                onClick = viewModel::confirmSuspiciousYes,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
            ) {
                Text("Так, зберегти", fontSize = 18.sp)
            }
            OutlinedButton(
                onClick = viewModel::confirmSuspiciousNo,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            ) {
                Text("Ввести ще раз", fontSize = 17.sp)
            }
        } else {
            Button(
                onClick = viewModel::save,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
            ) {
                Text("Зберегти", fontSize = 18.sp)
            }
            OutlinedButton(
                onClick = viewModel::skip,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            ) {
                Text("Пропустити", fontSize = 17.sp)
            }
        }
    }
}

private fun resourceLabel(type: String): String = when (type) {
    "COLD_WATER" -> "Холодна вода"
    "HOT_WATER" -> "Гаряча вода"
    "ELECTRICITY" -> "Електрика"
    "HEATING" -> "Підігрів"
    else -> type
}
