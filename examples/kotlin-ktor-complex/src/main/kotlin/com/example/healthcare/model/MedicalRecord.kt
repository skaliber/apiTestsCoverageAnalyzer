package com.example.healthcare.model

import kotlinx.serialization.Serializable

@Serializable
data class MedicalRecord(
    val id: String,
    val patientId: String,
    val authorDoctorId: String,
    val appointmentId: String?,
    val recordType: RecordType,
    val title: String,
    val content: String,
    val diagnosis: List<Diagnosis>,
    val vitals: Vitals?,
    val labResults: List<LabResult> = emptyList(),
    val imagingResults: List<ImagingResult> = emptyList(),
    val attachments: List<Attachment> = emptyList(),
    val isConfidential: Boolean = false,
    val accessibleByDoctors: List<String> = emptyList(),
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class Diagnosis(
    val icdCode: String,
    val description: String,
    val severity: String,
    val isPrimary: Boolean = false
)

@Serializable
data class Vitals(
    val bloodPressureSystolic: Int?,
    val bloodPressureDiastolic: Int?,
    val heartRate: Int?,
    val temperature: Double?,
    val weight: Double?,
    val height: Double?,
    val oxygenSaturation: Int?,
    val respiratoryRate: Int?
)

@Serializable
data class LabResult(
    val testName: String,
    val value: String,
    val unit: String,
    val referenceRange: String,
    val isAbnormal: Boolean,
    val performedAt: String
)

@Serializable
data class ImagingResult(
    val modality: String,
    val bodyPart: String,
    val findings: String,
    val reportedBy: String,
    val performedAt: String,
    val imageUrl: String? = null
)

@Serializable
data class Attachment(
    val name: String,
    val fileType: String,
    val fileSize: Long,
    val url: String,
    val uploadedAt: String
)

@Serializable
enum class RecordType {
    CONSULTATION_NOTES,
    LAB_REPORT,
    IMAGING,
    SURGERY_REPORT,
    DISCHARGE_SUMMARY,
    REFERRAL,
    VACCINATION,
    ALLERGY_RECORD,
    PROGRESS_NOTES,
    ANNUAL_PHYSICAL
}

@Serializable
data class CreateMedicalRecordRequest(
    val patientId: String,
    val appointmentId: String? = null,
    val recordType: RecordType,
    val title: String,
    val content: String,
    val diagnosis: List<Diagnosis> = emptyList(),
    val vitals: Vitals? = null,
    val isConfidential: Boolean = false
)

@Serializable
data class MedicalRecordSummary(
    val id: String,
    val patientId: String,
    val authorDoctorId: String,
    val recordType: RecordType,
    val title: String,
    val createdAt: String
)
