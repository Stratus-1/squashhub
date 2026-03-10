import Foundation
import HealthKit

final class HealthKitManager {
    
    // MARK: - Properties
    
    private let healthStore: HKHealthStore?
    
    // MARK: - Initialization
    
    init() {
        if HKHealthStore.isHealthDataAvailable() {
            healthStore = HKHealthStore()
        } else {
            healthStore = nil
        }
    }
    
    // MARK: - Availability
    
    var isAvailable: Bool {
        return healthStore != nil
    }
    
    func prepareIfAvailable() {
        #if DEBUG
        print("HealthKit available: \(isAvailable)")
        #endif
    }
    
    // MARK: - Authorization
    
    enum HealthKitManagerError: Error {
        case healthStoreUnavailable
    }
    
    func requestAuthorization(readTypes: Set<HKObjectType>, writeTypes: Set<HKSampleType>, completion: @escaping (Bool, Error?) -> Void) {
        guard let healthStore = healthStore else {
            DispatchQueue.main.async {
                completion(false, HealthKitManagerError.healthStoreUnavailable)
            }
            return
        }
        healthStore.requestAuthorization(toShare: writeTypes, read: readTypes) { success, error in
            DispatchQueue.main.async {
                completion(success, error)
            }
        }
    }
    
    func requestDefaultPermissions(completion: @escaping (Bool, Error?) -> Void) {
        guard let healthStore = healthStore else {
            DispatchQueue.main.async {
                completion(false, HealthKitManagerError.healthStoreUnavailable)
            }
            return
        }
        
        // Reading types
        let stepCount = HKObjectType.quantityType(forIdentifier: .stepCount)!
        let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate)!
        let workouts = HKObjectType.workoutType()
        let activeEnergyBurned = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!
        let distanceWalkingRunning = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!
        
        // Writing types (optional)
        let mindfulMinutes = HKObjectType.categoryType(forIdentifier: .mindfulSession)
        let writeWorkouts = HKObjectType.workoutType()
        
        var readTypes: Set<HKObjectType> = [stepCount, heartRate, workouts, activeEnergyBurned, distanceWalkingRunning]
        var writeTypes: Set<HKSampleType> = []
        
        if let mindfulMinutes = mindfulMinutes {
            writeTypes.insert(mindfulMinutes)
        }
        writeTypes.insert(writeWorkouts)
        
        healthStore.requestAuthorization(toShare: writeTypes, read: readTypes) { success, error in
            DispatchQueue.main.async {
                completion(success, error)
            }
        }
    }
    
    // MARK: - Data Fetching Helpers
    
    private func startOfToday() -> Date {
        return Calendar.current.startOfDay(for: Date())
    }
    
    private func dateRangeForToday() -> (start: Date, end: Date) {
        let start = startOfToday()
        let end = Calendar.current.date(byAdding: .day, value: 1, to: start)!
        return (start, end)
    }
    
    // MARK: - Fetch Today Step Count
    
    func fetchTodayStepCount(completion: @escaping (Double?, Error?) -> Void) {
        guard let healthStore = healthStore else {
            DispatchQueue.main.async {
                completion(nil, HealthKitManagerError.healthStoreUnavailable)
            }
            return
        }
        
        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            DispatchQueue.main.async {
                completion(nil, nil)
            }
            return
        }
        
        let (startDate, endDate) = dateRangeForToday()
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
        
        let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
            var stepCount: Double? = nil
            if let sum = result?.sumQuantity() {
                stepCount = sum.doubleValue(for: HKUnit.count())
            }
            DispatchQueue.main.async {
                completion(stepCount, error)
            }
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Fetch Recent Heart Rate Samples
    
    func fetchRecentHeartRateSamples(limit: Int = 20, completion: @escaping ([HKQuantitySample]?, Error?) -> Void) {
        guard let healthStore = healthStore else {
            DispatchQueue.main.async {
                completion(nil, HealthKitManagerError.healthStoreUnavailable)
            }
            return
        }
        
        guard let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
            DispatchQueue.main.async {
                completion(nil, nil)
            }
            return
        }
        
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(sampleType: heartRateType, predicate: nil, limit: limit, sortDescriptors: [sortDescriptor]) { _, samples, error in
            let quantitySamples = samples as? [HKQuantitySample]
            DispatchQueue.main.async {
                completion(quantitySamples, error)
            }
        }
        
        healthStore.execute(query)
    }
    
    // MARK: - Fetch Recent Workouts
    
    func fetchRecentWorkouts(limit: Int = 20, completion: @escaping ([HKWorkout]?, Error?) -> Void) {
        guard let healthStore = healthStore else {
            DispatchQueue.main.async {
                completion(nil, HealthKitManagerError.healthStoreUnavailable)
            }
            return
        }
        
        let workoutType = HKWorkoutType.workoutType()
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(sampleType: workoutType, predicate: nil, limit: limit, sortDescriptors: [sortDescriptor]) { _, samples, error in
            let workouts = samples as? [HKWorkout]
            DispatchQueue.main.async {
                completion(workouts, error)
            }
        }
        
        healthStore.execute(query)
    }
}
