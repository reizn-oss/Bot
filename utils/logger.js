/**
 * Small terminal logger used during /setup so the console output
 * matches the format described in the MVP spec:
 *
 *   Creating Roles...
 *   ✓ Administrator
 *   ✓ Student Welfare
 *   Creating Categories...
 *   ✓ INFORMATION
 *   ...
 *   Setup Complete.
 */

function step(title) {
    console.log(`\n${title}`);
}

function success(name) {
    console.log(`✓ ${name}`);
}

function skip(name) {
    console.log(`- ${name} (already exists)`);
}

function done(message = "Setup Complete.") {
    console.log(`\n${message}`);
}

function error(context, err) {
    console.error(`\n❌ ${context} failed.`);
    console.error(`Reason: ${err && err.message ? err.message : err}`);
}

module.exports = {
    step,
    success,
    skip,
    done,
    error
};
