package com.gbsquash.hub

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import java.time.Instant
import java.time.temporal.ChronoUnit

class HealthSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val healthConnectManager = HealthConnectManager(appContext)

    override suspend fun doWork(): Result {
        if (!healthConnectManager.isHealthConnectAvailable()) {
            return Result.failure()
        }

        if (!healthConnectManager.hasAllPermissions()) {
            // Can't request permissions from a background worker
            return Result.retry()
        }

        val endTime = Instant.now()
        val startTime = endTime.minus(1, ChronoUnit.HOURS)

        val steps = healthConnectManager.readSteps(startTime, endTime)
        
        // TODO: Sync 'steps' with your backend API
        // syncWithBackend(steps)

        return Result.success()
    }
}
