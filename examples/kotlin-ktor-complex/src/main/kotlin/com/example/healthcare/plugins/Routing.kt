package com.example.healthcare.plugins

import com.example.healthcare.routes.*
import com.example.healthcare.repository.AppointmentRepository
import com.example.healthcare.repository.PatientRepository
import com.example.healthcare.service.*
import io.ktor.server.application.*
import io.ktor.server.routing.*

fun Application.configureRouting() {
    val patientRepository = PatientRepository()
    val appointmentRepository = AppointmentRepository()
    val patientService = PatientService(patientRepository)
    val appointmentService = AppointmentService(appointmentRepository, patientRepository)
    val billingService = BillingService()
    val notificationService = NotificationService()

    routing {
        patientRoutes(patientService)
        doctorRoutes()
        appointmentRoutes(appointmentService, notificationService, patientRepository)
        prescriptionRoutes(notificationService)
        billingRoutes(billingService)
        medicalRecordRoutes()
        adminRoutes()
    }
}
