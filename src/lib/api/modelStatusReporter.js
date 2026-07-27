let reporter = () => {}

export function setModelStatusReporter(newReporter) {
  reporter = newReporter
}

export function reportModelStatus(status) {
  reporter(status)
}
