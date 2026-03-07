// Jenkins Declarative Pipeline – API Test Coverage Analysis
//
// Prerequisites:
//   - NodeJS tool named "node20" configured in Jenkins Global Tool Configuration
//   - HTML Publisher plugin  (for publishing the HTML summary report)
//   - JUnit plugin           (built-in; for publishing threshold results as test results)
//
// This pipeline uses the built-in summary engine from the library.
// No custom fail logic or summary parsing is needed – the library generates:
//   reports/build-summary.md   – CI summary (Markdown)
//   reports/pr-summary.md      – PR comment summary (Markdown)
//   reports/summary.json       – Machine-readable summary
//   reports/ai-summary.md      – AI-friendly summary
//
// Adjust threshold values in the "Coverage thresholds" environment block below.

pipeline {
    agent any

    // ── Coverage threshold values – edit these to suit your project ──────────
    environment {
        THRESHOLD_ENDPOINT    = '80'
        THRESHOLD_PARAMETER   = '70'
        THRESHOLD_BUSINESS    = '60'
        THRESHOLD_INTEGRATION = '50'
    }

    tools {
        nodejs 'node20'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('API Coverage Analysis') {
            parallel {
                stage('Endpoint coverage') {
                    steps {
                        sh """
                            node -r ts-node/register src/index.ts endpoint-coverage \\
                              --spec sample/openapi.yaml \\
                              --tests 'sample/tests/**/*.ts' \\
                              --format json,html,csv,junit \\
                              --threshold-endpoint ${THRESHOLD_ENDPOINT}
                        """
                    }
                }

                stage('Parameter coverage') {
                    steps {
                        sh """
                            node -r ts-node/register src/index.ts parameter-coverage \\
                              --spec sample/openapi-parameters.yaml \\
                              --tests 'sample/tests/**/*.ts' \\
                              --format json,html,csv,junit \\
                              --threshold-parameter ${THRESHOLD_PARAMETER}
                        """
                    }
                }

                stage('Business logic coverage') {
                    steps {
                        sh """
                            node -r ts-node/register src/index.ts business-coverage \\
                              --rules sample/business-rules.yaml \\
                              --tests 'sample/tests/**/*.ts' \\
                              --format json,html,csv,junit \\
                              --threshold-business ${THRESHOLD_BUSINESS}
                        """
                    }
                }

                stage('Integration flow coverage') {
                    steps {
                        sh """
                            node -r ts-node/register src/index.ts integration-coverage \\
                              --flows sample/integration-flows.yaml \\
                              --tests 'sample/tests/**/*.ts' \\
                              --format json,html,csv,junit \\
                              --threshold-integration ${THRESHOLD_INTEGRATION}
                        """
                    }
                }
            }
        }

        // Generate built-in summaries (build-summary.md, pr-summary.md, summary.json,
        // ai-summary.md).  No custom scripting is needed – the library owns this step.
        stage('Generate Summaries') {
            steps {
                sh """
                    node -r ts-node/register src/index.ts generate-summary \\
                      --reports-dir reports \\
                      --threshold-endpoint ${THRESHOLD_ENDPOINT} \\
                      --threshold-parameter ${THRESHOLD_PARAMETER} \\
                      --threshold-business ${THRESHOLD_BUSINESS} \\
                      --threshold-integration ${THRESHOLD_INTEGRATION}
                """
            }
        }
    }

    post {
        always {
            // Publish HTML coverage report (requires HTML Publisher plugin)
            publishHTML(target: [
                allowMissing         : true,
                alwaysLinkToLastBuild: true,
                keepAll              : true,
                reportDir            : 'reports',
                reportFiles          : 'coverage-summary.html',
                reportName           : 'API Coverage Report'
            ])

            // Publish the built-in build summary as an HTML page
            publishHTML(target: [
                allowMissing         : true,
                alwaysLinkToLastBuild: true,
                keepAll              : true,
                reportDir            : 'reports',
                reportFiles          : 'build-summary.md',
                reportName           : 'Build Summary'
            ])

            // Publish JUnit threshold results (built-in JUnit plugin)
            junit allowEmptyResults: true, testResults: 'reports/coverage-summary-junit.xml'

            // Archive all reports as build artifacts (includes built-in summaries)
            archiveArtifacts artifacts: 'reports/**', fingerprint: true

            // Print the build summary to the Jenkins console for quick inspection
            script {
                if (fileExists('reports/build-summary.md')) {
                    echo readFile('reports/build-summary.md')
                }
            }
        }
    }
}
