package com.example.banking.runners;

import org.junit.platform.suite.api.ConfigurationParameter;
import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectClasspathResource;
import org.junit.platform.suite.api.Suite;

import static io.cucumber.junit.platform.engine.Constants.*;

/**
 * Cucumber JUnit 5 suite runner.
 *
 * Runs all feature files found under src/test/resources/features.
 * Reports are written to build/reports/cucumber/.
 */
@Suite
@IncludeEngines("cucumber")
@SelectClasspathResource("features")
@ConfigurationParameter(
        key   = PLUGIN_PROPERTY_NAME,
        value = "pretty, html:build/reports/cucumber/index.html, json:build/reports/cucumber/results.json"
)
@ConfigurationParameter(
        key   = GLUE_PROPERTY_NAME,
        value = "com.example.banking"
)
@ConfigurationParameter(
        key   = FILTER_TAGS_PROPERTY_NAME,
        value = "not @Ignore"
)
public class CucumberRunner {
    // Entry point — no code needed. JUnit Platform discovers & runs scenarios.
}
