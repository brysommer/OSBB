package com.osbb.collector.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.osbb.collector.data.remote.ComplexDto
import com.osbb.collector.data.repo.SyncRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeUiState(
    val complexes: List<ComplexDto> = emptyList(),
    val period: String = "",
    val selectedComplexId: String? = null,
    val buildings: List<String> = emptyList(),
    val sectionsByBuilding: Map<String, List<String>> = emptyMap(),
    val selectedBuilding: String? = null,
    val selectedSection: String? = null,
    val pendingCount: Int = 0,
    val message: String? = null,
    val error: String? = null,
    val loading: Boolean = false,
)

class HomeViewModel(private val repo: SyncRepository) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                val complexes = repo.loadComplexes()
                val pending = repo.pendingCount()
                _state.update {
                    it.copy(
                        complexes = complexes.complexes,
                        period = complexes.period,
                        pendingCount = pending,
                        loading = false,
                        selectedComplexId = it.selectedComplexId ?: complexes.complexes.firstOrNull()?.id,
                    )
                }
                val complexId = _state.value.selectedComplexId
                if (complexId != null) loadStructure(complexId)
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun selectComplex(id: String) {
        _state.update {
            it.copy(
                selectedComplexId = id,
                selectedBuilding = null,
                selectedSection = null,
                buildings = emptyList(),
            )
        }
        loadStructure(id)
    }

    private fun loadStructure(complexId: String) {
        viewModelScope.launch {
            try {
                val structure = repo.loadStructure(complexId)
                val map = structure.buildings.associate { it.buildingNumber to it.sections }
                _state.update {
                    it.copy(
                        buildings = structure.buildings.map { b -> b.buildingNumber },
                        sectionsByBuilding = map,
                        selectedBuilding = it.selectedBuilding ?: structure.buildings.firstOrNull()?.buildingNumber,
                        selectedSection = null,
                    )
                }
                val building = _state.value.selectedBuilding
                if (building != null) {
                    val sections = map[building].orEmpty()
                    _state.update { it.copy(selectedSection = sections.firstOrNull()) }
                }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }

    fun selectBuilding(building: String) {
        val sections = _state.value.sectionsByBuilding[building].orEmpty()
        _state.update {
            it.copy(
                selectedBuilding = building,
                selectedSection = sections.firstOrNull(),
            )
        }
    }

    fun selectSection(section: String) {
        _state.update { it.copy(selectedSection = section) }
    }

    fun pull() {
        val s = _state.value
        val complexId = s.selectedComplexId ?: return
        val building = s.selectedBuilding ?: return
        val section = s.selectedSection ?: return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, message = null, error = null) }
            try {
                val count = repo.pull(complexId, building, section)
                _state.update {
                    it.copy(
                        loading = false,
                        message = "Завантажено $count лічильників (період ${s.period})",
                        pendingCount = repo.pendingCount(),
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun push() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, message = null, error = null) }
            try {
                val msg = repo.pushPending()
                _state.update {
                    it.copy(
                        loading = false,
                        message = msg,
                        pendingCount = repo.pendingCount(),
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    companion object {
        fun factory(repo: SyncRepository) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return HomeViewModel(repo) as T
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    onStartCollect: (complexId: String, building: String, section: String) -> Unit,
    onLogout: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(Unit) { viewModel.refresh() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Синхронізація", style = androidx.compose.material3.MaterialTheme.typography.headlineSmall)
            TextButton(onClick = onLogout) { Text("Вийти") }
        }

        Text("Період: ${state.period.ifBlank { "—" }}")
        Text("Локально не вивантажено: ${state.pendingCount}")

        DropdownField(
            label = "ЖК",
            value = state.complexes.firstOrNull { it.id == state.selectedComplexId }?.name ?: "",
            options = state.complexes.map { it.name to it.id },
            onSelect = { viewModel.selectComplex(it) },
        )
        DropdownField(
            label = "Будинок",
            value = state.selectedBuilding ?: "",
            options = state.buildings.map { it to it },
            onSelect = { viewModel.selectBuilding(it) },
        )
        DropdownField(
            label = "Підʼїзд",
            value = state.selectedSection ?: "",
            options = state.sectionsByBuilding[state.selectedBuilding].orEmpty().map { it to it },
            onSelect = { viewModel.selectSection(it) },
        )

        Button(onClick = viewModel::pull, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
            Text("⬇ Синхронізувати (завантажити)")
        }
        Button(
            onClick = {
                val s = state
                if (s.selectedComplexId != null && s.selectedBuilding != null && s.selectedSection != null) {
                    onStartCollect(s.selectedComplexId!!, s.selectedBuilding!!, s.selectedSection!!)
                }
            },
            enabled = !state.loading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("▶ Почати обхід офлайн")
        }
        Button(onClick = viewModel::push, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
            Text("⬆ Синхронізувати (вивантажити)")
        }

        if (state.message != null) Text(state.message!!)
        if (state.error != null) {
            Text(state.error!!, color = androidx.compose.material3.MaterialTheme.colorScheme.error)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DropdownField(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (title, id) ->
                DropdownMenuItem(
                    text = { Text(title) },
                    onClick = {
                        expanded = false
                        onSelect(id)
                    },
                )
            }
        }
    }
}
