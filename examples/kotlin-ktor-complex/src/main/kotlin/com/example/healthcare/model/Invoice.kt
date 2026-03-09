package com.example.healthcare.model

import kotlinx.serialization.Serializable

@Serializable
data class Invoice(
    val id: String,
    val patientId: String,
    val appointmentId: String?,
    val prescriptionId: String?,
    val lineItems: List<InvoiceLineItem>,
    val subtotal: Double,
    val insuranceCoverage: Double,
    val patientResponsibility: Double,
    val status: InvoiceStatus,
    val issuedAt: String,
    val dueDate: String,
    val paidAt: String? = null,
    val paymentMethod: PaymentMethod? = null,
    val insuranceClaim: InsuranceClaim? = null,
    val notes: String? = null
)

@Serializable
data class InvoiceLineItem(
    val description: String,
    val code: String,
    val quantity: Int,
    val unitPrice: Double,
    val total: Double,
    val insuranceCovered: Boolean = false
)

@Serializable
data class InsuranceClaim(
    val claimId: String,
    val provider: String,
    val submittedAt: String,
    val status: ClaimStatus,
    val approvedAmount: Double? = null,
    val rejectionReason: String? = null
)

@Serializable
enum class InvoiceStatus {
    DRAFT,
    PENDING_INSURANCE,
    INSURANCE_PROCESSED,
    PENDING_PAYMENT,
    PARTIALLY_PAID,
    PAID,
    OVERDUE,
    COLLECTIONS,
    WRITTEN_OFF
}

@Serializable
enum class ClaimStatus {
    SUBMITTED,
    PENDING,
    APPROVED,
    PARTIALLY_APPROVED,
    REJECTED,
    APPEALING
}

@Serializable
enum class PaymentMethod {
    CREDIT_CARD,
    DEBIT_CARD,
    BANK_TRANSFER,
    CASH,
    HSA,
    FSA,
    INSURANCE
}

@Serializable
data class CreateInvoiceRequest(
    val patientId: String,
    val appointmentId: String? = null,
    val prescriptionId: String? = null,
    val lineItems: List<InvoiceLineItem>,
    val dueDate: String,
    val notes: String? = null
)

@Serializable
data class PayInvoiceRequest(
    val paymentMethod: PaymentMethod,
    val amount: Double,
    val paymentReference: String? = null,
    val notes: String? = null
)

@Serializable
data class InvoiceSummary(
    val id: String,
    val patientId: String,
    val patientResponsibility: Double,
    val status: InvoiceStatus,
    val dueDate: String,
    val issuedAt: String
)
