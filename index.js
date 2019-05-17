const AWS = require('aws-sdk')
const moment = require('moment')

const pipeline = new AWS.CodePipeline({ region: 'us-west-2' })

async function getExecutionsRec(pipelineName, currentExecutions = [], nextToken) {
    console.log(`getting executions for ${pipelineName}`)

    const results = await pipeline.listPipelineExecutions({
        pipelineName: pipelineName,
        nextToken,
    }).promise()

    const executions = [...currentExecutions, ...results.pipelineExecutionSummaries]

    if (results.nextToken) {
        return await getExecutionsRec(executions, results.nextToken)
    } else {
        return executions
    }
}

async function getSummaries(pipelineName) {
  const results = await getExecutionsRec(pipelineName)
  return results
  .filter(function(summary) {
    return summary.status !== 'InProgress'
  })
  .reduce(function(reversed, summary) {
    return [summary, ...reversed]
  }, [])
}

function calculateTotalDuration(results) {
  const first = results[0]
  const last = results[results.length - 1]
  const start = moment(first.startTime)
  const end = moment(last.lastUpdateTime)
  return end.diff(start, 'minutes')
}

function calculateMeanTimeBetweenFailure(results) {
  const failureCount = results.filter(r => r.status === 'Failed').length
  return moment.duration(calculateTotalDuration(results) / failureCount, 'minutes').humanize()
}

function calculateCycleTime(results) {
  const successCount = results.filter(r => r.status === 'Succeeded').length
  return moment.duration(calculateTotalDuration(results) / successCount, 'minutes').humanize()
}

function calculateMeanTimeToRecover(results) {
  const lengths = []
  let start = undefined
  for (const summary of results) {
    if (!start && summary.status === 'Failed') {
      start = summary
    }

    if (summary.status === 'Succeeded' && start) {
      const end = summary
      lengths.push(
        moment(end.lastUpdateTime).diff(moment(start.startTime), 'minutes')
      )
      start = undefined
    }
  }
  const total = lengths.reduce(function(sum, next) {
    return sum + next
  }, 0)
  return moment.duration(total / lengths.length, 'minutes').humanize()
}

function calculateLeadTime(results) {
  const lengths = []
  let start = undefined
  for (const summary of results) {
    if (!start) {
      start = summary
    }

    if (summary.status === 'Succeeded') {
      const end = summary
      lengths.push(
        moment(end.lastUpdateTime).diff(moment(start.startTime), 'minutes')
      )
      start = undefined
    }
  }
  const total = lengths.reduce(function(sum, next) {
    return sum + next
  }, 0)
  return moment.duration(total / lengths.length, 'minutes').humanize()
}

function calculateFeedbackTime(results) {
  const sum = results.map(function(result) {
    return moment(result.lastUpdateTime).diff(moment(result.startTime), 'minutes')
  }).reduce(function(sum, next) {
    return sum + next
  }, 0)
  return moment.duration(sum / results.length, 'minutes').humanize()
}

async function getPipelineMetrics(pipelineName) {
  const results = await getSummaries(pipelineName)

  const duration = moment.duration(calculateTotalDuration(results), 'minutes').humanize()
  const cycleTime = calculateCycleTime(results)
  const leadTime = calculateLeadTime(results)
  const meanTimeBetweenFailure = calculateMeanTimeBetweenFailure(results)
  const meanTimeToRecover = calculateMeanTimeToRecover(results)
  const feedbackTime = calculateFeedbackTime(results)

  return { cycleTime, leadTime, meanTimeBetweenFailure, meanTimeToRecover, duration, feedbackTime }
}

async function getPipelineNamesRec(currentPipelineNames = [], nextToken) {
    console.log(`getting pipeline names`)

    const results = await pipeline.listPipelines({
        nextToken,
    }).promise()

    const pipelineNames = [...currentPipelineNames, ...results.pipelines.map(p => p.name)]

    if (results.nextToken) {
        return await getPipelineNamesRec(pipelineNames, results.nextToken)
    } else {
        return pipelineNames
    }
}

async function run() {
    const pipelineNames = await getPipelineNamesRec()
    const results = []
    for (const pipelineName of pipelineNames) {
        const pipelineResult = await getPipelineMetrics(pipelineName)
        results.push(pipelineResult)
    }
    for (const result of results) {
        console.log(result)
    }
}

run().catch(function(error) {
  console.error(error)
  process.exit(1)
})
