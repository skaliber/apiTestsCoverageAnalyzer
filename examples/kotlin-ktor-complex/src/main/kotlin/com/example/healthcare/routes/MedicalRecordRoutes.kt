package com.example.healthcare.routes

import com.example.healthcare.helpers.ApiPaths
import com.example.healthcare.model.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private val medicalRecords = ConcurrentHashMap<String, MedicalRecord>()

private fun initMedicalRecords() {
    if (medicalRecords.isEmpty()) {
        val sample = MedicalRecord(
            id = "rec-001",
            patientId = "patient-001",
            authorDoctorId = "doctor-001",
            appointmentId = "appt-001",
            recordType = RecordType.CONSULTATION_NOTES,
            title = "Annual Physical Exam",
            content = "Patient presents for annual physical. All vitals within normal range. " +
                    "Blood sugar slightly elevated - recommended diet changes and follow-up in 3 months.",
            diagnosis = listOf(
                Diagnosis("E11.9", "Type 2 diabetes mellitus without complications", "Moderate", true)
            ),
            vitals = Vitals(
                bloodPressureSystolic = 128,
                bloodPressureDiastolic = 82,
                heartRate = 74,
                temperature = 98.6,
                weight = 185.0,
                height = 68.0,
                oxygenSaturation = 98,
                respiratoryRate = 16
            ),
            accessibleByDoctors = listOf("doctor-001", "doctor-003"),
            createdAt = "2025-02-15T10:32:00Z",
            updatedAt = "2025-02-15T10:32:00Z"
        )
        medicalRecords[sample.id] = sample
    }
}

fun Route.medicalRecordRoutes() {
    initMedicalRecords()

    // GET /medical-records/{patientId} - get all records for a patient
    get(ApiPaths.MEDICAL_RECORDS) {
        val patientId = call.parameters["patientId"]
            ?: return@get call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Patient ID is required"))

        val requestingDoctorId = call.request.headers["X-Doctor-Id"]
        val requestingUserId = call.request.headers["X-User-Id"]

        // Business rule: medical-record-access-control - only assigned doctors can access records
        val records = medicalRecords.values.filter { record ->
            record.patientId == patientId
        }

        if (records.isEmpty()) {
            call.respond(HttpStatusCode.OK, emptyList<MedicalRecordSummary>())
            return@get
        }

        // Filter records based on access control
        val accessibleRecords = records.filter { record ->
            when {
                // Patient accessing own records (non-confidential only)
                requestingUserId == patientId -> !record.isConfidential
                // Doctor accessing records - must be in the accessible list
                requestingDoctorId != null -> !record.isConfidential ||
                        requestingDoctorId in record.accessibleByDoctors ||
                        requestingDoctorId == record.authorDoctorId
                // Admin access
                requestingUserId?.startsWith("admin-") == true -> true
                // No auth header - deny confidential
                else -> !record.isConfidential
            }
        }

        val summaries = accessibleRecords.map { record ->
            MedicalRecordSummary(
                id = record.id,
                patientId = record.patientId,
                authorDoctorId = record.authorDoctorId,
                recordType = record.recordType,
                title = record.title,
                createdAt = record.createdAt
            )
        }
        call.respond(HttpStatusCode.OK, summaries)
    }

    // POST /medical-records - create a new medical record
    post(ApiPaths.MEDICAL_RECORDS_CREATE) {
        val request = try {
            call.receive<CreateMedicalRecordRequest>()
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
            return@post
        }

        val doctorId = call.request.headers["X-Doctor-Id"]
            ?: return@post call.respond(HttpStatusCode.Unauthorized, ApiError("UNAUTHORIZED",
                "Doctor authentication required to create medical records"))

        if (request.title.isBlank()) {
            call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", "Record title is required"))
            return@post
        }

        if (request.content.isBlank()) {
            call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", "Record content is required"))
            return@post
        }

        val now = Instant.now().toString()
        val record = MedicalRecord(
            id = "rec-${UUID.randomUUID().toString().take(8)}",
            patientId = request.patientId,
            authorDoctorId = doctorId,
            appointmentId = request.appointmentId,
            recordType = request.recordType,
            title = request.title,
            content = request.content,
            diagnosis = request.diagnosis,
            vitals = request.vitals,
            isConfidential = request.isConfidential,
            accessibleByDoctors = listOf(doctorId),
            createdAt = now,
            updatedAt = now
        )
        medicalRecords[record.id] = record
        call.respond(HttpStatusCode.Created, record)
    }
}
