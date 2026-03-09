package com.example.healthcare.repository

import com.example.healthcare.model.*
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class AppointmentRepository {

    private val appointments = ConcurrentHashMap<String, Appointment>()

    init {
        val sampleAppointments = listOf(
            Appointment(
                id = "appt-001",
                patientId = "patient-001",
                doctorId = "doctor-001",
                scheduledAt = "2025-02-15T10:00:00Z",
                duration = 30,
                type = AppointmentType.ROUTINE_CHECKUP,
                status = AppointmentStatus.COMPLETED,
                reasonForVisit = "Annual physical exam",
                notes = "All vitals normal. Advised diet changes.",
                checkInTime = "2025-02-15T09:55:00Z",
                completedTime = "2025-02-15T10:32:00Z",
                createdAt = "2025-02-01T09:00:00Z",
                updatedAt = "2025-02-15T10:32:00Z"
            ),
            Appointment(
                id = "appt-002",
                patientId = "patient-002",
                doctorId = "doctor-002",
                scheduledAt = "2025-03-20T14:00:00Z",
                duration = 45,
                type = AppointmentType.SPECIALIST_REFERRAL,
                status = AppointmentStatus.SCHEDULED,
                reasonForVisit = "Asthma management follow-up",
                createdAt = "2025-03-01T11:00:00Z",
                updatedAt = "2025-03-01T11:00:00Z"
            ),
            Appointment(
                id = "appt-003",
                patientId = "patient-001",
                doctorId = "doctor-003",
                scheduledAt = "2025-03-25T11:00:00Z",
                duration = 60,
                type = AppointmentType.FOLLOW_UP,
                status = AppointmentStatus.CONFIRMED,
                reasonForVisit = "Diabetes management review",
                createdAt = "2025-03-10T08:00:00Z",
                updatedAt = "2025-03-12T10:00:00Z"
            )
        )
        sampleAppointments.forEach { appointments[it.id] = it }
    }

    fun findAll(
        page: Int = 1,
        pageSize: Int = 20,
        patientId: String? = null,
        doctorId: String? = null,
        status: AppointmentStatus? = null
    ): List<Appointment> {
        var filtered = appointments.values.toList()
        if (patientId != null) filtered = filtered.filter { it.patientId == patientId }
        if (doctorId != null) filtered = filtered.filter { it.doctorId == doctorId }
        if (status != null) filtered = filtered.filter { it.status == status }
        val start = (page - 1) * pageSize
        return filtered.sortedByDescending { it.scheduledAt }.drop(start).take(pageSize)
    }

    fun findById(id: String): Appointment? = appointments[id]

    fun findByPatientAndTimeRange(patientId: String, start: String, end: String): List<Appointment> {
        return appointments.values.filter { appt ->
            appt.patientId == patientId &&
            appt.scheduledAt >= start &&
            appt.scheduledAt <= end &&
            appt.status !in listOf(AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW)
        }
    }

    fun findByDoctorAndDate(doctorId: String, date: String): List<Appointment> {
        return appointments.values.filter { appt ->
            appt.doctorId == doctorId &&
            appt.scheduledAt.startsWith(date) &&
            appt.status !in listOf(AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW)
        }
    }

    fun save(request: CreateAppointmentRequest): Appointment {
        val now = Instant.now().toString()
        val appointment = Appointment(
            id = "appt-${UUID.randomUUID().toString().take(8)}",
            patientId = request.patientId,
            doctorId = request.doctorId,
            scheduledAt = request.scheduledAt,
            duration = request.duration,
            type = request.type,
            status = AppointmentStatus.SCHEDULED,
            reasonForVisit = request.reasonForVisit,
            notes = request.notes,
            createdAt = now,
            updatedAt = now
        )
        appointments[appointment.id] = appointment
        return appointment
    }

    fun update(id: String, request: UpdateAppointmentRequest): Appointment? {
        val existing = appointments[id] ?: return null
        val updated = existing.copy(
            scheduledAt = request.scheduledAt ?: existing.scheduledAt,
            duration = request.duration ?: existing.duration,
            type = request.type ?: existing.type,
            reasonForVisit = request.reasonForVisit ?: existing.reasonForVisit,
            notes = request.notes ?: existing.notes,
            status = request.status ?: existing.status,
            cancellationReason = request.cancellationReason ?: existing.cancellationReason,
            updatedAt = Instant.now().toString()
        )
        appointments[id] = updated
        return updated
    }

    fun checkIn(id: String, request: CheckInRequest): Appointment? {
        val existing = appointments[id] ?: return null
        val updated = existing.copy(
            status = AppointmentStatus.CHECKED_IN,
            checkInTime = request.arrivalTime,
            notes = if (request.notes != null) "${existing.notes ?: ""}\nCheck-in: ${request.notes}".trim()
                    else existing.notes,
            updatedAt = Instant.now().toString()
        )
        appointments[id] = updated
        return updated
    }

    fun complete(id: String, request: CompleteAppointmentRequest): Appointment? {
        val existing = appointments[id] ?: return null
        val updated = existing.copy(
            status = AppointmentStatus.COMPLETED,
            completedTime = Instant.now().toString(),
            followUpRequired = request.followUpRequired,
            notes = buildString {
                append(existing.notes ?: "")
                append("\nDiagnosis: ${request.diagnosis}")
                append("\nTreatment: ${request.treatmentPlan}")
                if (request.notes != null) append("\n${request.notes}")
            }.trim(),
            updatedAt = Instant.now().toString()
        )
        appointments[id] = updated
        return updated
    }

    fun cancel(id: String, reason: String, fee: Double?): Appointment? {
        val existing = appointments[id] ?: return null
        val updated = existing.copy(
            status = AppointmentStatus.CANCELLED,
            cancellationReason = reason,
            cancellationFee = fee,
            updatedAt = Instant.now().toString()
        )
        appointments[id] = updated
        return updated
    }

    fun count(): Int = appointments.size
}
