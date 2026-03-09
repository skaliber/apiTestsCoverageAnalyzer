package com.example.healthcare.routes

import com.example.healthcare.helpers.ApiPaths
import com.example.healthcare.model.*
import com.example.healthcare.service.NotificationService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private val prescriptions = ConcurrentHashMap<String, Prescription>()

init {
    val sample = Prescription(
        id = "rx-001",
        patientId = "patient-001",
        doctorId = "doctor-001",
        appointmentId = "appt-001",
        medications = listOf(
            Medication("Metformin", "500mg", "Twice daily", "90 days", "Take with food", false)
        ),
        issuedAt = "2025-02-15T11:00:00Z",
        validUntil = "2025-05-15T00:00:00Z",
        status = PrescriptionStatus.ACTIVE,
        refillsAllowed = 2
    )
    prescriptions[sample.id] = sample
}

fun Route.prescriptionRoutes(notificationService: NotificationService) {

    // POST /prescriptions - create a new prescription
    post(ApiPaths.PRESCRIPTIONS) {
        val request = try {
            call.receive<CreatePrescriptionRequest>()
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
            return@post
        }

        if (request.medications.isEmpty()) {
            call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", "At least one medication is required"))
            return@post
        }

        // Business rule: prescription-controlled-substance - controlled substances require two-factor
        val hasControlledSubstance = request.medications.any { it.isControlledSubstance }
        val status = if (hasControlledSubstance) {
            PrescriptionStatus.AWAITING_TWO_FACTOR
        } else {
            PrescriptionStatus.ACTIVE
        }

        val now = Instant.now().toString()
        val prescription = Prescription(
            id = "rx-${UUID.randomUUID().toString().take(8)}",
            patientId = request.patientId,
            doctorId = request.doctorId,
            appointmentId = request.appointmentId,
            medications = request.medications,
            issuedAt = now,
            validUntil = request.validUntil,
            status = status,
            requiresTwoFactor = hasControlledSubstance,
            notes = request.notes,
            refillsAllowed = request.refillsAllowed
        )
        prescriptions[prescription.id] = prescription

        val responseStatus = if (hasControlledSubstance) {
            HttpStatusCode.Accepted // 202 - requires further action
        } else {
            HttpStatusCode.Created
        }
        call.respond(responseStatus, prescription)
    }

    // GET /prescriptions/{id} - get a specific prescription
    get(ApiPaths.PRESCRIPTION) {
        val id = call.parameters["id"]
            ?: return@get call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Prescription ID is required"))

        val prescription = prescriptions[id]
            ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", "Prescription with ID '$id' not found"))

        call.respond(HttpStatusCode.OK, prescription)
    }

    // PUT /prescriptions/{id}/fulfill - fulfill a prescription at a pharmacy
    put(ApiPaths.PRESCRIPTION_FULFILL) {
        val id = call.parameters["id"]
            ?: return@put call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Prescription ID is required"))

        val request = try {
            call.receive<FulfillPrescriptionRequest>()
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
            return@put
        }

        val existing = prescriptions[id]
            ?: return@put call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", "Prescription with ID '$id' not found"))

        if (existing.status == PrescriptionStatus.FULFILLED) {
            call.respond(HttpStatusCode.Conflict, ApiError("ALREADY_FULFILLED", "Prescription has already been fulfilled"))
            return@put
        }

        if (existing.status == PrescriptionStatus.EXPIRED) {
            call.respond(HttpStatusCode.Gone, ApiError("EXPIRED", "Prescription has expired and cannot be fulfilled"))
            return@put
        }

        // Business rule: prescription-controlled-substance - verify two-factor for controlled substances
        if (existing.requiresTwoFactor && !existing.twoFactorConfirmed) {
            if (request.twoFactorCode == null) {
                call.respond(HttpStatusCode.Forbidden, ApiError("TWO_FACTOR_REQUIRED",
                    "This prescription contains controlled substances and requires two-factor confirmation code"))
                return@put
            }
            // Validate two-factor code (simplified - in production, verify against stored code)
            if (request.twoFactorCode.length != 6 || !request.twoFactorCode.all { it.isDigit() }) {
                call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_TWO_FACTOR", "Invalid two-factor confirmation code"))
                return@put
            }
        }

        val updated = existing.copy(
            status = PrescriptionStatus.FULFILLED,
            pharmacyId = request.pharmacyId,
            fulfilledAt = request.fulfilledAt,
            twoFactorConfirmed = existing.requiresTwoFactor,
            refillsUsed = existing.refillsUsed + 1
        )
        prescriptions[id] = updated
        call.respond(HttpStatusCode.OK, updated)
    }
}
