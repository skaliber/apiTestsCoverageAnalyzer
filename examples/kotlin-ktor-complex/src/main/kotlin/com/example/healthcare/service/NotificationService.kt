package com.example.healthcare.service

import com.example.healthcare.model.Appointment
import com.example.healthcare.model.Patient
import com.example.healthcare.model.Prescription
import java.time.Instant
import java.util.concurrent.ConcurrentLinkedQueue

data class Notification(
    val id: String,
    val type: NotificationType,
    val recipientId: String,
    val recipientEmail: String,
    val subject: String,
    val body: String,
    val sentAt: String,
    val status: NotificationStatus = NotificationStatus.SENT
)

enum class NotificationType {
    APPOINTMENT_CONFIRMATION,
    APPOINTMENT_REMINDER,
    APPOINTMENT_CANCELLATION,
    APPOINTMENT_CHECKIN,
    PRESCRIPTION_READY,
    INVOICE_CREATED,
    INVOICE_PAID,
    MEDICAL_RECORD_ADDED,
    ACCOUNT_CREATED,
    TWO_FACTOR_CODE
}

enum class NotificationStatus {
    PENDING,
    SENT,
    DELIVERED,
    FAILED
}

class NotificationService {

    private val notificationLog = ConcurrentLinkedQueue<Notification>()

    fun sendAppointmentConfirmation(patient: Patient, appointment: Appointment) {
        val notification = Notification(
            id = "notif-${System.currentTimeMillis()}",
            type = NotificationType.APPOINTMENT_CONFIRMATION,
            recipientId = patient.id,
            recipientEmail = patient.email,
            subject = "Appointment Confirmation - ${appointment.scheduledAt}",
            body = """
                Dear ${patient.name},

                Your appointment has been confirmed.

                Date/Time: ${appointment.scheduledAt}
                Duration: ${appointment.duration} minutes
                Type: ${appointment.type}
                Reason: ${appointment.reasonForVisit}

                Please arrive 15 minutes early for check-in.

                Appointment ID: ${appointment.id}
            """.trimIndent(),
            sentAt = Instant.now().toString()
        )
        notificationLog.add(notification)
        // In a real application, this would dispatch to an email/SMS service
    }

    fun sendAppointmentReminder(patient: Patient, appointment: Appointment, hoursBeforeAppointment: Int) {
        val notification = Notification(
            id = "notif-${System.currentTimeMillis()}",
            type = NotificationType.APPOINTMENT_REMINDER,
            recipientId = patient.id,
            recipientEmail = patient.email,
            subject = "Appointment Reminder - ${appointment.scheduledAt}",
            body = """
                Dear ${patient.name},

                Reminder: You have an appointment in $hoursBeforeAppointment hours.

                Date/Time: ${appointment.scheduledAt}
                Appointment ID: ${appointment.id}

                If you need to cancel, please do so at least 24 hours before your appointment
                to avoid a cancellation fee.
            """.trimIndent(),
            sentAt = Instant.now().toString()
        )
        notificationLog.add(notification)
    }

    fun sendCancellationNotice(patient: Patient, appointment: Appointment, cancellationFee: Double?) {
        val feeNotice = if (cancellationFee != null) {
            "\n\nPlease note: A cancellation fee of $$cancellationFee has been applied " +
            "because the appointment was cancelled within 24 hours."
        } else ""

        val notification = Notification(
            id = "notif-${System.currentTimeMillis()}",
            type = NotificationType.APPOINTMENT_CANCELLATION,
            recipientId = patient.id,
            recipientEmail = patient.email,
            subject = "Appointment Cancellation Confirmation",
            body = """
                Dear ${patient.name},

                Your appointment scheduled for ${appointment.scheduledAt} has been cancelled.
                Reason: ${appointment.cancellationReason}$feeNotice

                To reschedule, please visit our portal or call us.
            """.trimIndent(),
            sentAt = Instant.now().toString()
        )
        notificationLog.add(notification)
    }

    fun sendPrescriptionReady(patient: Patient, prescription: Prescription) {
        val notification = Notification(
            id = "notif-${System.currentTimeMillis()}",
            type = NotificationType.PRESCRIPTION_READY,
            recipientId = patient.id,
            recipientEmail = patient.email,
            subject = "Prescription Ready",
            body = """
                Dear ${patient.name},

                Your prescription (ID: ${prescription.id}) is ready for pickup.

                Medications: ${prescription.medications.joinToString(", ") { it.name }}
                Valid Until: ${prescription.validUntil}

                Please bring your ID and insurance card to the pharmacy.
            """.trimIndent(),
            sentAt = Instant.now().toString()
        )
        notificationLog.add(notification)
    }

    fun sendTwoFactorCode(patient: Patient, code: String) {
        val notification = Notification(
            id = "notif-${System.currentTimeMillis()}",
            type = NotificationType.TWO_FACTOR_CODE,
            recipientId = patient.id,
            recipientEmail = patient.email,
            subject = "Prescription Two-Factor Confirmation Code",
            body = """
                Dear ${patient.name},

                Your two-factor confirmation code for a controlled substance prescription is:

                CODE: $code

                This code expires in 15 minutes. Do not share this code with anyone.
                If you did not request this, please contact us immediately.
            """.trimIndent(),
            sentAt = Instant.now().toString()
        )
        notificationLog.add(notification)
    }

    fun getNotificationLog(): List<Notification> = notificationLog.toList()

    fun getNotificationsForRecipient(recipientId: String): List<Notification> {
        return notificationLog.filter { it.recipientId == recipientId }
    }
}
