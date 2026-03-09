package com.example.healthcare.model

import kotlinx.serialization.Serializable

@Serializable
data class Appointment(
    val id: String,
    val patientId: String,
    val doctorId: String,
    val scheduledAt: String,
    val duration: Int, // minutes
    val type: AppointmentType,
    val status: AppointmentStatus,
    val reasonForVisit: String,
    val notes: String? = null,
    val checkInTime: String? = null,
    val completedTime: String? = null,
    val cancellationReason: String? = null,
    val cancellationFee: Double? = null,
    val followUpRequired: Boolean = false,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
enum class AppointmentType {
    IN_PERSON,
    TELEMEDICINE,
    FOLLOW_UP,
    EMERGENCY,
    ROUTINE_CHECKUP,
    SPECIALIST_REFERRAL
}

@Serializable
enum class AppointmentStatus {
    SCHEDULED,
    CONFIRMED,
    CHECKED_IN,
    IN_PROGRESS,
    COMPLETED,
    CANCELLED,
    NO_SHOW,
    RESCHEDULED
}

@Serializable
data class CreateAppointmentRequest(
    val patientId: String,
    val doctorId: String,
    val scheduledAt: String,
    val duration: Int = 30,
    val type: AppointmentType = AppointmentType.IN_PERSON,
    val reasonForVisit: String,
    val notes: String? = null
)

@Serializable
data class UpdateAppointmentRequest(
    val scheduledAt: String? = null,
    val duration: Int? = null,
    val type: AppointmentType? = null,
    val reasonForVisit: String? = null,
    val notes: String? = null,
    val status: AppointmentStatus? = null,
    val cancellationReason: String? = null
)

@Serializable
data class CheckInRequest(
    val arrivalTime: String,
    val notes: String? = null
)

@Serializable
data class CompleteAppointmentRequest(
    val diagnosis: String,
    val treatmentPlan: String,
    val followUpRequired: Boolean = false,
    val followUpDate: String? = null,
    val notes: String? = null
)

@Serializable
data class AppointmentSummary(
    val id: String,
    val patientId: String,
    val doctorId: String,
    val scheduledAt: String,
    val type: AppointmentType,
    val status: AppointmentStatus,
    val reasonForVisit: String
)
