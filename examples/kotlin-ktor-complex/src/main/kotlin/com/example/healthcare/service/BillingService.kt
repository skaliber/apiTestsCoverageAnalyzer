package com.example.healthcare.service

import com.example.healthcare.model.*
import com.example.healthcare.service.PatientService.ServiceResult
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class BillingService {

    private val invoices = ConcurrentHashMap<String, Invoice>()

    init {
        val sampleInvoice = Invoice(
            id = "inv-001",
            patientId = "patient-001",
            appointmentId = "appt-001",
            prescriptionId = null,
            lineItems = listOf(
                InvoiceLineItem("Office Visit - Level 2", "99213", 1, 150.00, 150.00, true),
                InvoiceLineItem("Blood Pressure Monitoring", "93784", 1, 75.00, 75.00, true)
            ),
            subtotal = 225.00,
            insuranceCoverage = 180.00,
            patientResponsibility = 45.00,
            status = InvoiceStatus.PENDING_PAYMENT,
            issuedAt = "2025-02-16T09:00:00Z",
            dueDate = "2025-03-16T00:00:00Z",
            insuranceClaim = InsuranceClaim(
                claimId = "CLM-2025-001",
                provider = "BlueCross",
                submittedAt = "2025-02-16T09:00:00Z",
                status = ClaimStatus.APPROVED,
                approvedAmount = 180.00
            )
        )
        invoices[sampleInvoice.id] = sampleInvoice
    }

    fun getInvoice(id: String): ServiceResult<Invoice> {
        val invoice = invoices[id]
            ?: return ServiceResult.NotFound("Invoice with ID '$id' not found")
        return ServiceResult.Success(invoice)
    }

    fun createInvoice(request: CreateInvoiceRequest): ServiceResult<Invoice> {
        if (request.lineItems.isEmpty()) {
            return ServiceResult.ValidationError("Invoice must have at least one line item")
        }

        val subtotal = request.lineItems.sumOf { it.total }

        // Business rule: billing-insurance-first - submit to insurance before billing patient
        // Determine if patient has insurance (simplified check)
        val insuranceCoverage = 0.0
        val patientResponsibility = subtotal - insuranceCoverage

        val now = Instant.now().toString()
        val invoice = Invoice(
            id = "inv-${UUID.randomUUID().toString().take(8)}",
            patientId = request.patientId,
            appointmentId = request.appointmentId,
            prescriptionId = request.prescriptionId,
            lineItems = request.lineItems,
            subtotal = subtotal,
            insuranceCoverage = insuranceCoverage,
            patientResponsibility = patientResponsibility,
            status = InvoiceStatus.PENDING_INSURANCE,
            issuedAt = now,
            dueDate = request.dueDate,
            notes = request.notes
        )
        invoices[invoice.id] = invoice
        return ServiceResult.Success(invoice)
    }

    fun payInvoice(id: String, request: PayInvoiceRequest): ServiceResult<Invoice> {
        val existing = invoices[id]
            ?: return ServiceResult.NotFound("Invoice with ID '$id' not found")

        if (existing.status == InvoiceStatus.PAID) {
            return ServiceResult.ValidationError("Invoice has already been paid")
        }

        if (existing.status == InvoiceStatus.WRITTEN_OFF) {
            return ServiceResult.ValidationError("Cannot pay a written-off invoice")
        }

        // Business rule: billing-insurance-first - must process insurance before patient pays
        if (existing.status == InvoiceStatus.PENDING_INSURANCE) {
            return ServiceResult.ValidationError(
                "Insurance claim must be processed before patient payment. " +
                "Current status: ${existing.status}"
            )
        }

        if (request.amount <= 0) {
            return ServiceResult.ValidationError("Payment amount must be greater than zero")
        }

        if (request.amount > existing.patientResponsibility) {
            return ServiceResult.ValidationError(
                "Payment amount (${request.amount}) exceeds patient responsibility (${existing.patientResponsibility})"
            )
        }

        val newStatus = if (request.amount >= existing.patientResponsibility) {
            InvoiceStatus.PAID
        } else {
            InvoiceStatus.PARTIALLY_PAID
        }

        val updated = existing.copy(
            status = newStatus,
            paidAt = Instant.now().toString(),
            paymentMethod = request.paymentMethod
        )
        invoices[id] = updated
        return ServiceResult.Success(updated)
    }

    fun getInvoicesForPatient(patientId: String): List<InvoiceSummary> {
        return invoices.values
            .filter { it.patientId == patientId }
            .sortedByDescending { it.issuedAt }
            .map { invoice ->
                InvoiceSummary(
                    id = invoice.id,
                    patientId = invoice.patientId,
                    patientResponsibility = invoice.patientResponsibility,
                    status = invoice.status,
                    dueDate = invoice.dueDate,
                    issuedAt = invoice.issuedAt
                )
            }
    }
}
