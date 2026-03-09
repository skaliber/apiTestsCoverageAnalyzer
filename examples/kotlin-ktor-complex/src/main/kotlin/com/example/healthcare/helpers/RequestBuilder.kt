package com.example.healthcare.helpers

import com.example.healthcare.model.*
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*

class HealthcareApiClient(private val client: HttpClient) {

    // Patient endpoints

    suspend fun createPatient(request: CreatePatientRequest): HttpResponse =
        client.post(ApiPaths.PATIENTS) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    suspend fun getPatients(page: Int = 1, pageSize: Int = 20, search: String? = null): HttpResponse =
        client.get(ApiPaths.PATIENTS) {
            parameter("page", page)
            parameter("pageSize", pageSize)
            if (search != null) parameter("search", search)
        }

    suspend fun getPatient(id: String): HttpResponse =
        client.get(ApiPaths.PATIENT.replace("{id}", id))

    suspend fun updatePatient(id: String, request: UpdatePatientRequest): HttpResponse =
        client.put(ApiPaths.PATIENT.replace("{id}", id)) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    suspend fun deletePatient(id: String): HttpResponse =
        client.delete(ApiPaths.PATIENT.replace("{id}", id))

    // Doctor endpoints

    suspend fun getDoctors(specialization: String? = null): HttpResponse =
        client.get(ApiPaths.DOCTORS) {
            if (specialization != null) parameter("specialization", specialization)
        }

    suspend fun getDoctor(id: String): HttpResponse =
        client.get(ApiPaths.DOCTOR.replace("{id}", id))

    suspend fun getDoctorAvailability(id: String, date: String? = null): HttpResponse =
        client.get(ApiPaths.DOCTOR_AVAILABILITY.replace("{id}", id)) {
            if (date != null) parameter("date", date)
        }

    // Appointment endpoints

    suspend fun bookAppointment(request: CreateAppointmentRequest): HttpResponse =
        client.post(ApiPaths.APPOINTMENTS) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    suspend fun getAppointments(
        patientId: String? = null,
        doctorId: String? = null,
        status: String? = null
    ): HttpResponse =
        client.get(ApiPaths.APPOINTMENTS) {
            if (patientId != null) parameter("patientId", patientId)
            if (doctorId != null) parameter("doctorId", doctorId)
            if (status != null) parameter("status", status)
        }

    suspend fun getAppointment(id: String): HttpResponse =
        client.get(ApiPaths.APPOINTMENT.replace("{id}", id))

    suspend fun updateAppointment(id: String, request: UpdateAppointmentRequest): HttpResponse =
        client.put(ApiPaths.APPOINTMENT.replace("{id}", id)) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    suspend fun cancelAppointment(id: String, reason: String): HttpResponse =
        client.delete(ApiPaths.APPOINTMENT.replace("{id}", id)) {
            parameter("reason", reason)
        }

    suspend fun checkInAppointment(id: String, request: CheckInRequest): HttpResponse =
        client.post(ApiPaths.APPOINTMENT_CHECKIN.replace("{id}", id)) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    suspend fun completeAppointment(id: String, request: CompleteAppointmentRequest): HttpResponse =
        client.post(ApiPaths.APPOINTMENT_COMPLETE.replace("{id}", id)) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    // Prescription endpoints

    suspend fun createPrescription(request: CreatePrescriptionRequest): HttpResponse =
        client.post(ApiPaths.PRESCRIPTIONS) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    suspend fun getPrescription(id: String): HttpResponse =
        client.get(ApiPaths.PRESCRIPTION.replace("{id}", id))

    suspend fun fulfillPrescription(id: String, request: FulfillPrescriptionRequest): HttpResponse =
        client.put(ApiPaths.PRESCRIPTION_FULFILL.replace("{id}", id)) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    // Billing endpoints

    suspend fun createInvoice(request: CreateInvoiceRequest): HttpResponse =
        client.post(ApiPaths.BILLING_INVOICES) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    suspend fun getInvoice(id: String): HttpResponse =
        client.get(ApiPaths.BILLING_INVOICE.replace("{id}", id))

    suspend fun payInvoice(id: String, request: PayInvoiceRequest): HttpResponse =
        client.post(ApiPaths.BILLING_INVOICE_PAY.replace("{id}", id)) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    // Medical records endpoints

    suspend fun getMedicalRecords(patientId: String): HttpResponse =
        client.get(ApiPaths.MEDICAL_RECORDS.replace("{patientId}", patientId))

    suspend fun createMedicalRecord(request: CreateMedicalRecordRequest): HttpResponse =
        client.post(ApiPaths.MEDICAL_RECORDS_CREATE) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    // Admin endpoints

    suspend fun getHealthStatus(): HttpResponse =
        client.get(ApiPaths.ADMIN_HEALTH)

    suspend fun getMetrics(): HttpResponse =
        client.get(ApiPaths.ADMIN_METRICS)

    suspend fun getAuditLog(page: Int = 1, pageSize: Int = 50): HttpResponse =
        client.get(ApiPaths.ADMIN_AUDIT_LOG) {
            parameter("page", page)
            parameter("pageSize", pageSize)
        }
}
