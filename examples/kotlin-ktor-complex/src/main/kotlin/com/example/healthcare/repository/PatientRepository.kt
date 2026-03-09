package com.example.healthcare.repository

import com.example.healthcare.model.*
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class PatientRepository {

    private val patients = ConcurrentHashMap<String, Patient>()

    init {
        // Seed some sample data
        val samplePatients = listOf(
            Patient(
                id = "patient-001",
                name = "Alice Johnson",
                dateOfBirth = "1985-03-15",
                email = "alice.johnson@email.com",
                phone = "555-0101",
                address = Address("123 Main St", "Springfield", "IL", "62701"),
                insuranceInfo = InsuranceInfo("BlueCross", "BC123456", "GRP789", "2025-12-31", CoverageType.PPO),
                emergencyContact = EmergencyContact("Bob Johnson", "Spouse", "555-0102"),
                medicalHistory = listOf("Hypertension", "Type 2 Diabetes"),
                allergies = listOf("Penicillin", "Sulfa drugs"),
                createdAt = "2023-01-10T10:00:00Z",
                updatedAt = "2024-01-10T10:00:00Z"
            ),
            Patient(
                id = "patient-002",
                name = "Robert Martinez",
                dateOfBirth = "1972-07-22",
                email = "robert.martinez@email.com",
                phone = "555-0201",
                address = Address("456 Oak Ave", "Chicago", "IL", "60601"),
                insuranceInfo = InsuranceInfo("Aetna", "AE654321", null, "2025-06-30", CoverageType.HMO),
                emergencyContact = EmergencyContact("Maria Martinez", "Spouse", "555-0202"),
                medicalHistory = listOf("Asthma"),
                allergies = listOf("Aspirin"),
                createdAt = "2023-02-15T09:00:00Z",
                updatedAt = "2024-03-20T11:00:00Z"
            ),
            Patient(
                id = "patient-003",
                name = "Sarah Chen",
                dateOfBirth = "1998-11-30",
                email = "sarah.chen@email.com",
                phone = "555-0301",
                address = Address("789 Pine Rd", "Oak Park", "IL", "60302"),
                insuranceInfo = null,
                emergencyContact = EmergencyContact("Wei Chen", "Father", "555-0302"),
                createdAt = "2023-06-01T14:00:00Z",
                updatedAt = "2023-06-01T14:00:00Z"
            )
        )
        samplePatients.forEach { patients[it.id] = it }
    }

    fun findAll(page: Int = 1, pageSize: Int = 20, search: String? = null): List<Patient> {
        val allPatients = patients.values.filter { it.isActive }
        val filtered = if (search != null) {
            allPatients.filter {
                it.name.contains(search, ignoreCase = true) ||
                it.email.contains(search, ignoreCase = true)
            }
        } else {
            allPatients
        }
        val start = (page - 1) * pageSize
        return filtered.sortedBy { it.name }.drop(start).take(pageSize)
    }

    fun findById(id: String): Patient? = patients[id]

    fun findByEmail(email: String): Patient? = patients.values.find { it.email == email }

    fun save(request: CreatePatientRequest): Patient {
        val now = Instant.now().toString()
        val patient = Patient(
            id = "patient-${UUID.randomUUID().toString().take(8)}",
            name = request.name,
            dateOfBirth = request.dateOfBirth,
            email = request.email,
            phone = request.phone,
            address = request.address,
            insuranceInfo = request.insuranceInfo,
            emergencyContact = request.emergencyContact,
            allergies = request.allergies,
            createdAt = now,
            updatedAt = now
        )
        patients[patient.id] = patient
        return patient
    }

    fun update(id: String, request: UpdatePatientRequest): Patient? {
        val existing = patients[id] ?: return null
        val updated = existing.copy(
            name = request.name ?: existing.name,
            email = request.email ?: existing.email,
            phone = request.phone ?: existing.phone,
            address = request.address ?: existing.address,
            insuranceInfo = request.insuranceInfo ?: existing.insuranceInfo,
            emergencyContact = request.emergencyContact ?: existing.emergencyContact,
            allergies = request.allergies ?: existing.allergies,
            updatedAt = Instant.now().toString()
        )
        patients[id] = updated
        return updated
    }

    fun delete(id: String): Boolean {
        val existing = patients[id] ?: return false
        patients[id] = existing.copy(isActive = false, updatedAt = Instant.now().toString())
        return true
    }

    fun count(): Int = patients.values.count { it.isActive }
}
