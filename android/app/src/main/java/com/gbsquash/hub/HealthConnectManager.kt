package com.gbsquash.hub

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.ZonedDateTime

class HealthConnectManager(private val context: Context) {

    private val healthConnectClient by lazy { HealthConnectClient.getOrCreate(context) }

    fun isHealthConnectAvailable(): Boolean {
        return HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
    }

    suspend fun hasAllPermissions(): Boolean {
        val permissions = setOf(
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getWritePermission(StepsRecord::class)
        )
        val granted = healthConnectClient.permissionController.getGrantedPermissions()
        return granted.containsAll(permissions)
    }

    fun getPermissions() = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getWritePermission(StepsRecord::class)
    )

    suspend fun readSteps(startTime: Instant, endTime: Instant): List<StepsRecord> {
        return try {
            val response = healthConnectClient.readRecords(
                ReadRecordsRequest(
                    StepsRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(startTime, endTime)
                )
            )
            response.records
        } catch (e: Exception) {
            Log.e("HealthConnect", "Error reading steps", e)
            emptyList()
        }
    }

    suspend fun writeSteps(count: Long, startTime: ZonedDateTime, endTime: ZonedDateTime) {
        val stepsRecord = StepsRecord(
            count = count,
            startTime = startTime.toInstant(),
            startZoneOffset = startTime.offset,
            endTime = endTime.toInstant(),
            endZoneOffset = endTime.offset
        )
        try {
            healthConnectClient.insertRecords(listOf(stepsRecord))
        } catch (e: Exception) {
            Log.e("HealthConnect", "Error writing steps", e)
        }
    }
}
