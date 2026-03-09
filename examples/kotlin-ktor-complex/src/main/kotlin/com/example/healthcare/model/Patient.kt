package com.example.healthcare.model

import kotlinx.serialization.Serializable
import java.time.LocalDate

@Serializable
data class Patient(
    val id: String,
    val name: String,
    val dateOfBirth: String,
    val email: String,
    val phone: String,
    val address: Address,
    val insuranceInfo: InsuranceInfo?,
    val emergencyContact: EmergencyContact?,
    val medicalHistory: List<String> = emptyList(),
    val allergies: List<String> = emptyList(),
    val createdAt: String,
    val updatedAt: String,
    val isActive: Boolean = true
)

@Serializable
data class Address(
    val street: String,
    val city: String,
    val state: String,
    val zipCode: String,
    val country: String = "US"
)

@Serializable
data class InsuranceInfo(
    val provider: String,
    val policyNumber: String,
    val groupNumber: String?,
    val expiryDate: String,
    val coverageType: CoverageType
)

@Serializable
data class EmergencyContact(
    val name: String,
    val relationship: String,
    val phone: String
)

@Serializable
enum class CoverageType {
    HMO, PPO, EPO, HDHP, MEDICARE, MEDICAID
}

@Serializable
data class CreatePatientRequest(
    val name: String,
    val dateOfBirth: String,
    val email: String,
    val phone: String,
    val address: Address,
    val insuranceInfo: InsuranceInfo? = null,
    val emergencyContact: EmergencyContact? = null,
    val allergies: List<String> = emptyList()
)

@Serializable
data class UpdatePatientRequest(
    val name: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val address: Address? = null,
    val insuranceInfo: InsuranceInfo? = null,
    val emergencyContact: EmergencyContact? = null,
    val allergies: List<String>? = null
)

@Serializable
data class PatientSummary(
    val id: String,
    val name: String,
    val dateOfBirth: String,
    val email: String,
    val isActive: Boolean
)
