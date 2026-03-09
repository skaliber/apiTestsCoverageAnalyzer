package com.example.healthcare.model

import kotlinx.serialization.Serializable

@Serializable
data class Doctor(
    val id: String,
    val name: String,
    val specialization: Specialization,
    val licenseNumber: String,
    val email: String,
    val phone: String,
    val department: String,
    val yearsOfExperience: Int,
    val education: List<Education>,
    val availableSlots: List<TimeSlot> = emptyList(),
    val rating: Double = 0.0,
    val isAcceptingPatients: Boolean = true,
    val consultationFee: Double,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class Education(
    val degree: String,
    val institution: String,
    val year: Int
)

@Serializable
data class TimeSlot(
    val date: String,
    val startTime: String,
    val endTime: String,
    val isAvailable: Boolean = true
)

@Serializable
enum class Specialization {
    GENERAL_PRACTICE,
    CARDIOLOGY,
    DERMATOLOGY,
    ENDOCRINOLOGY,
    GASTROENTEROLOGY,
    NEUROLOGY,
    ONCOLOGY,
    ORTHOPEDICS,
    PEDIATRICS,
    PSYCHIATRY,
    PULMONOLOGY,
    RADIOLOGY,
    SURGERY,
    UROLOGY
}

@Serializable
data class DoctorAvailability(
    val doctorId: String,
    val doctorName: String,
    val availableSlots: List<TimeSlot>,
    val nextAvailableDate: String?
)

@Serializable
data class DoctorSummary(
    val id: String,
    val name: String,
    val specialization: Specialization,
    val department: String,
    val isAcceptingPatients: Boolean,
    val consultationFee: Double,
    val rating: Double
)
