package com.example.healthcare.helpers

object ApiPaths {
    const val PATIENTS = "/patients"
    const val PATIENT = "/patients/{id}"
    const val DOCTORS = "/doctors"
    const val DOCTOR = "/doctors/{id}"
    const val DOCTOR_AVAILABILITY = "/doctors/{id}/availability"
    const val APPOINTMENTS = "/appointments"
    const val APPOINTMENT = "/appointments/{id}"
    const val APPOINTMENT_CHECKIN = "/appointments/{id}/check-in"
    const val APPOINTMENT_COMPLETE = "/appointments/{id}/complete"
    const val PRESCRIPTIONS = "/prescriptions"
    const val PRESCRIPTION = "/prescriptions/{id}"
    const val PRESCRIPTION_FULFILL = "/prescriptions/{id}/fulfill"
    const val BILLING_INVOICES = "/billing/invoices"
    const val BILLING_INVOICE = "/billing/invoices/{id}"
    const val BILLING_INVOICE_PAY = "/billing/invoices/{id}/pay"
    const val MEDICAL_RECORDS = "/medical-records/{patientId}"
    const val MEDICAL_RECORDS_CREATE = "/medical-records"
    const val ADMIN_HEALTH = "/admin/health"
    const val ADMIN_METRICS = "/admin/metrics"
    const val ADMIN_AUDIT_LOG = "/admin/audit-log"
}
