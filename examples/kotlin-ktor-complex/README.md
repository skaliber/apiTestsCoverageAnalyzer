# Healthcare Appointments & Patient Management API
## Kotlin + Ktor Example Project for API Tests Coverage Analyzer

This example project demonstrates the **API Tests Coverage Analyzer** tool applied to a realistic
Kotlin/Ktor REST API for a healthcare domain. It showcases both partial coverage (initial test suite)
and full coverage (complete test suite), including business rule testing, indirect endpoint resolution
via `ApiPaths` constants, and wrapper-pattern test detection via `HealthcareApiClient`.

---

## Project Overview

**Domain**: Healthcare - appointments, patients, doctors, prescriptions, billing, and medical records

**Technology Stack**:
- Kotlin 1.9.x
- Ktor 2.3.x (server framework)
- kotlinx.serialization (JSON)
- JUnit 5 + Kotest (testing)
- Ktor test utilities (`testApplication`)
- Gradle (build tool)
- JaCoCo (code coverage)

---

## Directory Structure

```
kotlin-ktor-complex/
  src/
    main/kotlin/com/example/healthcare/
      Application.kt               # Ktor application entry point
      plugins/
        Routing.kt                 # Route configuration
        Authentication.kt          # JWT authentication setup
        Serialization.kt           # JSON serialization config
      routes/
        PatientRoutes.kt           # POST/GET/PUT/DELETE /patients
        DoctorRoutes.kt            # GET /doctors, /doctors/{id}/availability
        AppointmentRoutes.kt       # Full appointment lifecycle
        PrescriptionRoutes.kt      # Prescription management
        BillingRoutes.kt           # Invoice creation and payment
        MedicalRecordRoutes.kt     # Medical records with access control
        AdminRoutes.kt             # Health, metrics, audit log
      service/
        PatientService.kt          # Patient business logic
        AppointmentService.kt      # Appointment business logic + rules
        BillingService.kt          # Billing and invoice logic
        NotificationService.kt     # Email/SMS notifications
      repository/
        PatientRepository.kt       # In-memory patient storage
        AppointmentRepository.kt   # In-memory appointment storage
      model/
        Patient.kt                 # Patient, Address, InsuranceInfo models
        Doctor.kt                  # Doctor, Specialization models
        Appointment.kt             # Appointment, status enums
        Prescription.kt            # Prescription, Medication models
        Invoice.kt                 # Invoice, billing models
        MedicalRecord.kt           # Medical record models
      helpers/
        ApiPaths.kt                # Centralized path constants (indirect resolution)
        RequestBuilder.kt          # HealthcareApiClient wrapper (wrapper resolution)
    resources/
      application.conf             # Ktor configuration (HOCON)
  src/
    test/kotlin/com/example/healthcare/
      tests-initial/               # ~50% endpoint coverage
        PatientTest.kt             # Happy path only (6 tests)
        AppointmentTest.kt         # Happy path only (5 tests)
      tests-complete/              # Near 100% endpoint coverage
        PatientTest.kt             # Full CRUD with all error paths (25+ tests)
        AppointmentTest.kt         # Full lifecycle with business rules (20+ tests)
        DoctorTest.kt              # All doctor endpoints (15+ tests)
        PrescriptionTest.kt        # Including controlled substance rules (18+ tests)
        BillingTest.kt             # Including insurance-first rule (15+ tests)
        MedicalRecordTest.kt       # Including access control rules (15+ tests)
        AdminTest.kt               # All admin endpoints (12+ tests)
        SecurityTest.kt            # Cross-cutting security tests (12+ tests)
        ErrorTest.kt               # Comprehensive error scenarios (20+ tests)
  openapi.yaml                     # OpenAPI 3.0 specification
  config.yaml                      # Analyzer configuration
  business-rules.yaml              # 8 enforced business rules
  integration-flows.yaml           # 5 end-to-end integration flows
  build.gradle.kts                 # Gradle build configuration
  gradle.properties                # Dependency versions
  settings.gradle.kts              # Project settings
  .github/workflows/analyze.yml    # GitHub Actions CI pipeline
  Jenkinsfile                      # Jenkins CI/CD pipeline
  README.md                        # This file
```

---

## API Endpoints (24 total)

### Patients
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/patients` | Register a new patient |
| `GET` | `/patients` | List patients (paginated, searchable) |
| `GET` | `/patients/{id}` | Get patient details |
| `PUT` | `/patients/{id}` | Update patient information |
| `DELETE` | `/patients/{id}` | Soft-delete a patient |

### Doctors
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/doctors` | List doctors (filterable by specialization, department) |
| `GET` | `/doctors/{id}` | Get doctor profile |
| `GET` | `/doctors/{id}/availability` | Get available time slots |

### Appointments
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/appointments` | Book an appointment |
| `GET` | `/appointments` | List appointments (filterable) |
| `GET` | `/appointments/{id}` | Get appointment details |
| `PUT` | `/appointments/{id}` | Update appointment |
| `DELETE` | `/appointments/{id}` | Cancel appointment |
| `POST` | `/appointments/{id}/check-in` | Patient check-in |
| `POST` | `/appointments/{id}/complete` | Complete appointment with diagnosis |

### Prescriptions
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/prescriptions` | Create prescription |
| `GET` | `/prescriptions/{id}` | Get prescription details |
| `PUT` | `/prescriptions/{id}/fulfill` | Fulfill prescription at pharmacy |

### Billing
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/billing/invoices` | Create invoice |
| `GET` | `/billing/invoices/{id}` | Get invoice details |
| `POST` | `/billing/invoices/{id}/pay` | Pay invoice |

### Medical Records
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/medical-records/{patientId}` | Get patient's records |
| `POST` | `/medical-records` | Create medical record |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/health` | System health check |
| `GET` | `/admin/metrics` | System metrics |
| `GET` | `/admin/audit-log` | Paginated audit log |

---

## Business Rules Enforced

Eight critical business rules are enforced by this API:

1. **patient-data-privacy** - Patients can only access their own records; doctors access their patients
2. **appointment-advance-booking** - Appointments must be booked at least 24 hours in advance
3. **doctor-availability-check** - Doctor must be available at requested appointment time
4. **prescription-controlled-substance** - Controlled substances require two-factor confirmation (202 response)
5. **billing-insurance-first** - Insurance must be processed before patient is billed
6. **appointment-cancellation-fee** - $50 fee for cancellations within 24 hours of appointment
7. **duplicate-appointment-prevention** - Patients cannot have overlapping appointments
8. **medical-record-access-control** - Only authorized doctors can access confidential records

See `business-rules.yaml` for full details and test scenarios.

---

## Coverage Journey

This project is designed to demonstrate the value of the API Tests Coverage Analyzer by showing
a clear progression from partial to complete coverage.

### Initial Test Suite (`tests-initial/`)

The initial test suite contains only `PatientTest.kt` and `AppointmentTest.kt`, with approximately
**50% endpoint coverage**:

- **Covered**: POST /patients, GET /patients, GET /patients/{id}, PUT /patients/{id},
  DELETE /patients/{id}, GET /appointments, GET /appointments/{id}, POST /appointments
- **Not Covered**: All doctor, prescription, billing, medical record, and admin endpoints
- **Missing scenarios**: Error paths, business rule violations, security tests

### Complete Test Suite (`tests-complete/`)

The complete test suite adds 7 more test files providing near **100% endpoint coverage**:

- All 24 endpoints tested
- Error paths (400, 404, 409, 410) for every endpoint
- Business rule validations explicitly tested
- Security scenarios (access control, authentication)
- Both direct HTTP calls and `HealthcareApiClient` wrapper calls

---

## Indirect Resolution Features

This project demonstrates two key indirect resolution challenges for coverage analyzers:

### 1. ApiPaths Constants (`helpers/ApiPaths.kt`)

Route definitions use constants instead of string literals:
```kotlin
// In routes:
get(ApiPaths.DOCTOR_AVAILABILITY) { ... }
post(ApiPaths.APPOINTMENT_CHECKIN) { ... }

// In tests:
client.get(ApiPaths.ADMIN_HEALTH)
apiClient.getHealthStatus() // calls client.get(ApiPaths.ADMIN_HEALTH)
```

The analyzer must resolve `ApiPaths.DOCTOR_AVAILABILITY` to `/doctors/{id}/availability`.

### 2. HealthcareApiClient Wrapper (`helpers/RequestBuilder.kt`)

Tests use a wrapper class that encapsulates endpoint calls:
```kotlin
class HealthcareApiClient(private val client: HttpClient) {
    suspend fun getPatient(id: String): HttpResponse =
        client.get(ApiPaths.PATIENT.replace("{id}", id))

    suspend fun bookAppointment(request: AppointmentRequest): HttpResponse =
        client.post(ApiPaths.APPOINTMENTS) { setBody(request) }
}
```

Test code:
```kotlin
val apiClient = createApiClient()
val response = apiClient.getPatient("patient-001")      // → GET /patients/{id}
val response = apiClient.bookAppointment(request)        // → POST /appointments
```

The analyzer must trace through the wrapper method to identify the actual HTTP method and path.

---

## Running the Application

```bash
# Build the project
./gradlew build

# Run the application
./gradlew run

# Run tests only
./gradlew test

# Run tests and generate coverage report
./gradlew test jacocoTestReport

# Build fat JAR
./gradlew buildFatJar
java -jar build/libs/healthcare-api.jar
```

The API will be available at `http://localhost:8080`.

---

## Running the Coverage Analyzer

```bash
# Analyze initial test suite
python -m apiTestsCoverageAnalyzer \
    --config examples/kotlin-ktor-complex/config.yaml \
    --project examples/kotlin-ktor-complex \
    --test-suite tests-initial \
    --output reports/initial

# Analyze complete test suite
python -m apiTestsCoverageAnalyzer \
    --config examples/kotlin-ktor-complex/config.yaml \
    --project examples/kotlin-ktor-complex \
    --test-suite tests-complete \
    --output reports/complete

# Compare coverage between suites
python -m apiTestsCoverageAnalyzer \
    --compare \
    --baseline reports/initial/coverage.json \
    --target reports/complete/coverage.json \
    --output reports/comparison

# Include business rules and integration flow analysis
python -m apiTestsCoverageAnalyzer \
    --config examples/kotlin-ktor-complex/config.yaml \
    --project examples/kotlin-ktor-complex \
    --business-rules examples/kotlin-ktor-complex/business-rules.yaml \
    --integration-flows examples/kotlin-ktor-complex/integration-flows.yaml \
    --test-suite tests-complete \
    --output reports/full-analysis
```

---

## Sample API Requests

### Create Patient
```bash
curl -X POST http://localhost:8080/patients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "dateOfBirth": "1992-08-14",
    "email": "jane.smith@example.com",
    "phone": "555-1234",
    "address": {
      "street": "456 Elm St",
      "city": "Chicago",
      "state": "IL",
      "zipCode": "60601"
    }
  }'
```

### Book Appointment (valid - 48h in advance)
```bash
curl -X POST http://localhost:8080/appointments \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "patient-001",
    "doctorId": "doctor-001",
    "scheduledAt": "2026-06-01T10:00:00Z",
    "duration": 30,
    "type": "ROUTINE_CHECKUP",
    "reasonForVisit": "Annual physical exam"
  }'
```

### Check Health
```bash
curl http://localhost:8080/admin/health
```

---

## License

MIT License - for educational and demonstration purposes.
