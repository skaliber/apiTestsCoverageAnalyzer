package com.example.healthcare.model

import kotlinx.serialization.Serializable

@Serializable
data class Prescription(
    val id: String,
    val patientId: String,
    val doctorId: String,
    val appointmentId: String?,
    val medications: List<Medication>,
    val issuedAt: String,
    val validUntil: String,
    val status: PrescriptionStatus,
    val pharmacyId: String? = null,
    val fulfilledAt: String? = null,
    val requiresTwoFactor: Boolean = false,
    val twoFactorConfirmed: Boolean = false,
    val notes: String? = null,
    val refillsAllowed: Int = 0,
    val refillsUsed: Int = 0
)

@Serializable
data class Medication(
    val name: String,
    val dosage: String,
    val frequency: String,
    val duration: String,
    val instructions: String,
    val isControlledSubstance: Boolean = false,
    val dea_schedule: String? = null
)

@Serializable
enum class PrescriptionStatus {
    PENDING,
    ACTIVE,
    FULFILLED,
    EXPIRED,
    CANCELLED,
    AWAITING_TWO_FACTOR
}

@Serializable
data class CreatePrescriptionRequest(
    val patientId: String,
    val doctorId: String,
    val appointmentId: String? = null,
    val medications: List<Medication>,
    val validUntil: String,
    val notes: String? = null,
    val refillsAllowed: Int = 0
)

@Serializable
data class FulfillPrescriptionRequest(
    val pharmacyId: String,
    val fulfilledAt: String,
    val twoFactorCode: String? = null,
    val notes: String? = null
)
