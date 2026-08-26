package com.osbb.collector.data.remote

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query
import com.osbb.collector.data.prefs.SessionStore

data class LoginRequest(
    val telegramId: Long,
)

data class LoginResponse(
    val token: String,
    val user: LoginUser,
    val complexes: List<ComplexDto> = emptyList(),
)

data class LoginUser(
    val id: String,
    val telegramId: Long,
    val name: String?,
)

data class ComplexesResponse(
    val complexes: List<ComplexDto>,
    val period: String,
)

data class ComplexDto(
    val id: String,
    val name: String,
    val shortName: String?,
)

data class StructureResponse(
    val buildings: List<BuildingDto>,
    val period: String,
)

data class BuildingDto(
    val buildingNumber: String,
    val sections: List<String>,
)

data class PullResponse(
    val period: String,
    val complex: ComplexDto,
    val buildingNumber: String,
    val sectionNumber: String,
    val resourceTypes: List<String>,
    val meters: List<MeterDto>,
)

data class MeterDto(
    val meterId: String,
    val dahId: String,
    val name: String,
    val serialNumber: String?,
    val resourceType: String,
    val premisesId: String,
    val buildingNumber: String,
    val sectionNumber: String,
    val floor: Int?,
    val apartmentNumber: String,
    val previous: Double,
    val alreadyCollected: Boolean,
    val selfSubmitted: Double?,
)

data class PushRequest(
    val period: String?,
    val readings: List<PushReadingDto>,
)

data class PushReadingDto(
    val clientSyncId: String,
    val meterId: String,
    val previous: Double,
    val current: Double,
)

data class PushResponse(
    val period: String,
    val created: Int,
    val duplicates: Int,
    val errors: Int,
    val results: List<PushResultDto>,
)

data class PushResultDto(
    val clientSyncId: String,
    val status: String,
    val readingId: String?,
    val reason: String?,
)

interface MobileApi {
    @POST("api/mobile/auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("api/mobile/complexes")
    suspend fun complexes(): ComplexesResponse

    @GET("api/mobile/complexes/{complexId}/structure")
    suspend fun structure(
        @retrofit2.http.Path("complexId") complexId: String,
    ): StructureResponse

    @GET("api/mobile/pull")
    suspend fun pull(
        @Query("complexId") complexId: String,
        @Query("building") building: String,
        @Query("section") section: String,
    ): PullResponse

    @POST("api/mobile/push")
    suspend fun push(@Body body: PushRequest): PushResponse
}

class MobileApiFactory(private val sessionStore: SessionStore) {
    private val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    suspend fun create(authRequired: Boolean = true): MobileApi {
        val baseUrl = sessionStore.apiBase()
        val token = sessionStore.token()

        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val authInterceptor = Interceptor { chain ->
            val builder = chain.request().newBuilder()
            if (authRequired && !token.isNullOrBlank()) {
                builder.header("Authorization", "Bearer $token")
            }
            chain.proceed(builder.build())
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(MobileApi::class.java)
    }
}
