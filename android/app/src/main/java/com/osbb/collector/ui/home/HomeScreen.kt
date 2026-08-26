package com.osbb.collector.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    val userName: String = "",
    val complexes: List<ComplexDto> = emptyList(),
    val period: String = "",
    val selectedComplexId: String? = null,
    val buildings: List<String> = emptyList(),
    val sectionsByBuilding: Map<String, List<String>> = emptyMap(),
    val selectedBuilding: String? = null,
    val selectedSection: String? = null,
    val metersTotal: Int = 0,
    val metersTodo: Int = 0,
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
                val name = repo.userName()
                val complexes = repo.loadComplexes()
                val pending = repo.pendingCount()
                val (lastComplex, lastBuilding, lastSection) = repo.lastSelection()
                val complexId =
                    _state.value.selectedComplexId
                        ?: lastComplex
                        ?: complexes.complexes.firstOrNull()?.id

                _state.update {
                    it.copy(
                        userName = name,
                        complexes = complexes.complexes,
                        period = complexes.period,
                        pendingCount = pending,
                        loading = false,
                        selectedComplexId = complexId,
                        selectedBuilding = lastBuilding,
                        selectedSection = lastSection,
                    )
                }
                if (complexId != null) {
                    loadStructure(complexId, preferBuilding = lastBuilding, preferSection = lastSection)
                }
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
                metersTotal = 0,
                metersTodo = 0,
            )
        }
        loadStructure(id)
    }

    private fun loadStructure(
        complexId: String,
        preferBuilding: String? = null,
        preferSection: String? = null,
    ) {
        viewModelScope.launch {
            try {
                val structure = repo.loadStructure(complexId)
                val map = structure.buildings.associate { it.buildingNumber to it.sections }
                val building =
                    preferBuilding?.takeIf { map.containsKey(it) }
                        ?: _state.value.selectedBuilding?.takeIf { map.containsKey(it) }
                        ?: structure.buildings.firstOrNull()?.buildingNumber
                val sections = building?.let { map[it].orEmpty() }.orEmpty()
                val section =
                    preferSection?.takeIf { sections.contains(it) }
                        ?: sections.firstOrNull()

                _state.update {
                    it.copy(
                        buildings = structure.buildings.map { b -> b.buildingNumber },
                        sectionsByBuilding = map,
                        selectedBuilding = building,
                        selectedSection = section,
                    )
                }
                refreshStats()
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
        refreshStats()
    }

    fun selectSection(section: String) {
        _state.update { it.copy(selectedSection = section) }
        refreshStats()
    }

    private fun refreshStats() {
        val s = _state.value
        val complexId = s.selectedComplexId ?: return
        val building = s.selectedBuilding ?: return
        val section = s.selectedSection ?: return
        viewModelScope.launch {
            val stats = repo.sectionStats(complexId, building, section)
            _state.update {
                it.copy(
                    metersTotal = stats.metersTotal,
                    metersTodo = stats.metersTodo,
                    pendingCount = stats.pendingUpload,
                )
            }
        }
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
                val stats = repo.sectionStats(complexId, building, section)
                _state.update {
                    it.copy(
                        loading = false,
                        message = "Завантажено $count лічильників. Можна йти в обхід.",
                        metersTotal = stats.metersTotal,
                        metersTodo = stats.metersTodo,
                        pendingCount = stats.pendingUpload,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Помилка завантаження") }
            }
        }
    }

    fun push() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, message = null, error = null) }
            try {
                val msg = repo.pushPending()
                refreshStats()
                _state.update {
                    it.copy(
                        loading = false,
                        message = msg,
                        pendingCount = repo.pendingCount(),
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Помилка вивантаження") }
            }
        }
    }

    fun rememberAndStart(onStart: (String, String, String) -> Unit) {
        val s = _state.value
        val complexId = s.selectedComplexId ?: return
        val building = s.selectedBuilding ?: return
        val section = s.selectedSection ?: return
        viewModelScope.launch {
            repo.rememberSelection(complexId, building, section)
            onStart(complexId, building, section)
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
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text(
                    if (state.userName.isNotBlank()) "Вітаю, ${state.userName}" else "OSBB збір",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text("Період: ${state.period.ifBlank { "—" }}")
            }
            TextButton(onClick = onLogout) { Text("Вийти") }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Локально в підʼїзді: ${state.metersTotal}")
                Text("Ще зняти: ${state.metersTodo}")
                Text(
                    "Чекають вивантаження: ${state.pendingCount}",
                    fontWeight = if (state.pendingCount > 0) FontWeight.Bold else FontWeight.Normal,
                )
            }
        }

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

        Spacer(Modifier.height(4.dp))

        BigButton(
            text = "1. Завантажити підʼїзд",
            enabled = !state.loading,
            onClick = viewModel::pull,
        )
        BigButton(
            text = "2. Обхід офлайн",
            enabled = !state.loading && state.metersTotal > 0,
            onClick = { viewModel.rememberAndStart(onStartCollect) },
        )
        BigButton(
            text = "3. Вивантажити покази (${state.pendingCount})",
            enabled = !state.loading && state.pendingCount > 0,
            onClick = viewModel::push,
        )

        if (state.message != null) Text(state.message!!)
        if (state.error != null) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun BigButton(text: String, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
        colors = ButtonDefaults.buttonColors(),
    ) {
        Text(text, fontSize = 18.sp)
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
