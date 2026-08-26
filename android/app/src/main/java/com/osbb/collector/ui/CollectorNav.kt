package com.osbb.collector.ui

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.osbb.collector.data.AppContainer
import com.osbb.collector.ui.collect.CollectScreen
import com.osbb.collector.ui.collect.CollectViewModel
import com.osbb.collector.ui.home.HomeScreen
import com.osbb.collector.ui.home.HomeViewModel
import com.osbb.collector.ui.login.LoginScreen
import com.osbb.collector.ui.login.LoginViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun CollectorNav(container: AppContainer) {
    val nav = rememberNavController()
    val scope = rememberCoroutineScope()
    var start by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val token = container.sessionStore.tokenFlow.first()
        start = if (token.isNullOrBlank()) "login" else "home"
    }

    if (start == null) return

    NavHost(navController = nav, startDestination = start!!) {
        composable("login") {
            val vm: LoginViewModel = viewModel(
                factory = LoginViewModel.factory(container.syncRepository, container.sessionStore),
            )
            LoginScreen(
                viewModel = vm,
                onLoggedIn = {
                    nav.navigate("home") {
                        popUpTo("login") { inclusive = true }
                    }
                },
            )
        }
        composable("home") {
            val vm: HomeViewModel = viewModel(
                factory = HomeViewModel.factory(container.syncRepository),
            )
            HomeScreen(
                viewModel = vm,
                onStartCollect = { complexId, building, section ->
                    nav.navigate(
                        "collect/${Uri.encode(complexId)}/${Uri.encode(building)}/${Uri.encode(section)}",
                    )
                },
                onLogout = {
                    scope.launch {
                        container.sessionStore.clearToken()
                        nav.navigate("login") {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                },
            )
        }
        composable(
            route = "collect/{complexId}/{building}/{section}",
            arguments = listOf(
                navArgument("complexId") { type = NavType.StringType },
                navArgument("building") { type = NavType.StringType },
                navArgument("section") { type = NavType.StringType },
            ),
        ) { entry ->
            val complexId = Uri.decode(entry.arguments!!.getString("complexId")!!)
            val building = Uri.decode(entry.arguments!!.getString("building")!!)
            val section = Uri.decode(entry.arguments!!.getString("section")!!)
            val vm: CollectViewModel = viewModel(
                factory = CollectViewModel.factory(
                    container.syncRepository,
                    complexId,
                    building,
                    section,
                ),
            )
            CollectScreen(
                viewModel = vm,
                onBack = { nav.popBackStack() },
            )
        }
    }
}
