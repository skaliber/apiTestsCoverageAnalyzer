package com.example.healthcare.service

import com.example.healthcare.model.*
import com.example.healthcare.repository.AppointmentRepository
import com.example.healthcare.repository.PatientRepository
import com.example.healthcare.service.PatientService.ServiceResult
import java.time.Instant
import java.time.temporal.ChronoUnit

class AppointmentService(
    private val appointmentRepository: AppointmentRepository,
    private val patientRepository: PatientRepository
) {

    data class PagedResult<T>(
        val items: List<T>,
        val totalCount: Int,
        val page: Int,
        val pageSize: Int,
        val totalPages: Int
    )

    fun getAppointments(
        page: Int,
        pageSize: Int,
        patientId: String? = null,
        doctorId: String? = null,
        status: AppointmentStatus? = null
    ): PagedResult<AppointmentSummary> {
        val appointments = appointmentRepository.findAll(page, pageSize, patientId, doctorId, status)
        val total = appointmentRepository.count()
        val summaries = appointments.map { appt ->
            AppointmentSummary(
                id = appt.id,
                patientId = appt.patientId,
                doctorId = appt.doctorId,
                scheduledAt = appt.scheduledAt,
                type = appt.type,
                status = appt.status,
                reasonForVisit = appt.reasonForVisit
            )
        }
        return PagedResult(
            items = summaries,
            totalCount = total,
            page = page,
            pageSize = pageSize,
            totalPages = (total + pageSize - 1) / pageSize
        )
    }

    fun getAppointment(id: String): ServiceResult<Appointment> {
        val appointment = appointmentRepository.findById(id)
            ?: return ServiceResult.NotFound("Appointment with ID '$id' not found")
        return ServiceResult.Success(appointment)
    }

    fun createAppointment(request: CreateAppointmentRequest): ServiceResult<Appointment> {
        // Validate patient exists
        patientRepository.findById(request.patientId)
            ?: return ServiceResult.NotFound("Patient with ID '${request.patientId}' not found")

        // Business rule: appointment-advance-booking - must be booked 24h in advance
        val scheduledTime = try {
            Instant.parse(request.scheduledAt)
        } catch (e: Exception) {
            return ServiceResult.ValidationError("Invalid scheduledAt format. Use ISO 8601 (e.g., 2025-03-20T14:00:00Z)")
        }

        val now = Instant.now()
        val hoursUntilAppointment = ChronoUnit.HOURS.between(now, scheduledTime)
        if (hoursUntilAppointment < 24) {
            return ServiceResult.ValidationError(
                "Appointments must be booked at least 24 hours in advance. " +
                "Please choose a time at least ${24 - hoursUntilAppointment} more hours away."
            )
        }

        // Business rule: duplicate-appointment-prevention - no overlapping appointments for same patient
        val startOfDay = request.scheduledAt.substring(0, 10) + "T00:00:00Z"
        val endOfDay = request.scheduledAt.substring(0, 10) + "T23:59:59Z"
        val existingAppointments = appointmentRepository.findByPatientAndTimeRange(
            request.patientId, startOfDay, endOfDay
        )
        val requestedStart = scheduledTime
        val requestedEnd = requestedStart.plus(request.duration.toLong(), ChronoUnit.MINUTES)

        for (existing in existingAppointments) {
            val existingStart = Instant.parse(existing.scheduledAt)
            val existingEnd = existingStart.plus(existing.duration.toLong(), ChronoUnit.MINUTES)
            if (requestedStart < existingEnd && requestedEnd > existingStart) {
                return ServiceResult.Conflict(
                    "Patient already has an appointment at this time (ID: ${existing.id}). " +
                    "Overlapping appointments are not allowed."
                )
            }
        }

        // Business rule: doctor-availability-check - verify doctor is available
        val doctorAppointments = appointmentRepository.findByDoctorAndDate(
            request.doctorId, request.scheduledAt.substring(0, 10)
        )
        for (existing in doctorAppointments) {
            val existingStart = Instant.parse(existing.scheduledAt)
            val existingEnd = existingStart.plus(existing.duration.toLong(), ChronoUnit.MINUTES)
            if (requestedStart < existingEnd && requestedEnd > existingStart) {
                return ServiceResult.Conflict(
                    "Doctor is not available at the requested time. Please choose a different time slot."
                )
            }
        }

        if (request.duration < 15 || request.duration > 240) {
            return ServiceResult.ValidationError("Appointment duration must be between 15 and 240 minutes")
        }

        val appointment = appointmentRepository.save(request)
        return ServiceResult.Success(appointment)
    }

    fun updateAppointment(id: String, request: UpdateAppointmentRequest): ServiceResult<Appointment> {
        val existing = appointmentRepository.findById(id)
            ?: return ServiceResult.NotFound("Appointment with ID '$id' not found")

        if (existing.status in listOf(AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED)) {
            return ServiceResult.ValidationError(
                "Cannot update appointment with status '${existing.status}'"
            )
        }

        // Business rule: appointment-cancellation-fee
        if (request.status == AppointmentStatus.CANCELLED) {
            return cancelAppointment(id, request.cancellationReason ?: "Cancelled by user")
        }

        val updated = appointmentRepository.update(id, request)
            ?: return ServiceResult.NotFound("Appointment with ID '$id' not found")
        return ServiceResult.Success(updated)
    }

    fun cancelAppointment(id: String, reason: String): ServiceResult<Appointment> {
        val existing = appointmentRepository.findById(id)
            ?: return ServiceResult.NotFound("Appointment with ID '$id' not found")

        if (existing.status in listOf(AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED)) {
            return ServiceResult.ValidationError(
                "Appointment is already ${existing.status.name.lowercase()}"
            )
        }

        // Business rule: appointment-cancellation-fee - fee for cancellations within 24h
        val scheduledTime = Instant.parse(existing.scheduledAt)
        val now = Instant.now()
        val hoursUntilAppointment = ChronoUnit.HOURS.between(now, scheduledTime)
        val cancellationFee = if (hoursUntilAppointment in 0..24) 50.0 else null

        val updated = appointmentRepository.cancel(id, reason, cancellationFee)
            ?: return ServiceResult.NotFound("Appointment with ID '$id' not found")
        return ServiceResult.Success(updated)
    }

    fun checkInAppointment(id: String, request: CheckInRequest): ServiceResult<Appointment> {
        val existing = appointmentRepository.findById(id)
            ?: return ServiceResult.NotFound("Appointment with ID '$id' not found")

        if (existing.status != AppointmentStatus.SCHEDULED && existing.status != AppointmentStatus.CONFIRMED) {
            return ServiceResult.ValidationError(
                "Cannot check in appointment with status '${existing.status}'. " +
                "Appointment must be SCHEDULED or CONFIRMED."
            )
        }

        val updated = appointmentRepository.checkIn(id, request)
            ?: return ServiceResult.NotFound("Appointment with ID '$id' not found")
        return ServiceResult.Success(updated)
    }

    fun completeAppointment(id: String, request: CompleteAppointmentRequest): ServiceResult<Appointment> {
        val existing = appointmentRepository.findById(id)
            ?: return ServiceResult.NotFound("Appointment with ID '$id' not found")

        if (existing.status != AppointmentStatus.CHECKED_IN && existing.status != AppointmentStatus.IN_PROGRESS) {
            return ServiceResult.ValidationError(
                "Cannot complete appointment with status '${existing.status}'. " +
                "Appointment must be CHECKED_IN or IN_PROGRESS."
            )
        }

        if (request.diagnosis.isBlank()) {
            return ServiceResult.ValidationError("Diagnosis is required to complete an appointment")
        }

        val updated = appointmentRepository.complete(id, request)
            ?: return ServiceResult.NotFound("Appointment with ID '$id' not found")
        return ServiceResult.Success(updated)
    }
}
