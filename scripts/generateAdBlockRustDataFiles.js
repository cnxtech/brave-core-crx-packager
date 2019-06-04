/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Engine, lists } = require('adblock-rs')
const path = require('path')
const fs = require('fs')
const request = require('request')

/**
 * Returns a promise that which resolves with the list data
 *
 * @param listURL The URL of the list to fetch
 * @param filter The filter function to apply to the body
 * @return a promise that resolves with the content of the list or rejects with an error message.
 */
const getListBufferFromURL = (listURL, filter) => {
  return new Promise((resolve, reject) => {
    request.get(listURL, function (error, response, body) {
      if (error) {
        reject(new Error(`Request error: ${error}`))
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Error status code ${response.statusCode} returned for URL: ${listURL}`))
        return
      }
      if (filter) {
        body = filter(body)
      }
      resolve(body)
    })
  })
}

/**
 * Returns a filter function to apply for a specific UUID
 *
 * @param uuid The UUID that the filter function should be returned for.
 */
const getListFilterFunction = (uuid) => {
  // Apply any transformations based on list UUID here
  // if (uuid === 'FBB430E8-3910-4761-9373-840FC3B43FF2') {
  //  return (input) => input.split('\n').slice(4)
  //    .map((line) => `||${line}`).join('\n')
  // }
  return undefined
}


/**
 * Parses the passed in filter rule data and serializes a data file to disk.
 *
 * @param filterRuleData The filter rule data to parse, or an array of such strings.
 * @param outputDATFilename The filename of the DAT file to create.
 */
const generateDataFileFromString = (filterRuleData, outputDATFilename, outSubdir) => {
  let rules
  if (filterRuleData.constructor === Array) {
    rules = filterRuleData.join('\n')
  } else {
    rules = filterRuleData
  }
  const client = new Engine(rules.split('\n'))
  const arrayBuffer = client.serialize()
  let outPath = path.join('build')
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outPath)
  }
  outPath = path.join(outPath, 'ad-block-updater')
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outPath)
  }
  outPath = path.join(outPath, outSubdir)
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outPath)
  }
  fs.writeFileSync(path.join(outPath, outputDATFilename), Buffer.from(arrayBuffer))
}

/**
 * Convenience function that uses getListBufferFromURL and generateDataFileFromString
 * to construct a DAT file from a URL while applying a specific filter.
 *
 * @param listURL the URL of the list to fetch.
 * @param outputDATFilename the DAT filename to write to.
 * @param filter The filter function to apply.
 * @return a Promise which resolves if successful or rejects if there's an error.
 */
const generateDataFileFromURL = (listURL, langs, uuid, outputDATFilename, filter) => {
  return new Promise((resolve, reject) => {
    console.log(`${langs} ${listURL}...`)
    request.get(listURL, function (error, response, body) {
      if (error) {
        reject(new Error(`Request error: ${error}`))
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Error status code ${response.statusCode} returned for URL: ${listURL}`))
        return
      }
      if (filter) {
        body = filter(body)
      }
      generateDataFileFromString([body], outputDATFilename, uuid)
      resolve()
    })
  })
}

/**
 * Convenience function that generates a DAT file for each region
 */
const generateDataFilesForAllRegions = () => {
  console.log('Processing per region list updates...')
  let p = Promise.resolve()
  new lists("regions").forEach((region) => {
    p = p.then(generateDataFileFromURL.bind(null, region.url,
      region.langs, region.uuid, `rs-${region.uuid}.dat`))
  })
  return p
}

/**
 * Convenience function that generates a DAT file for the default list
 */
const generateDataFilesForList = (lists, filename) => {
  let promises = []
  lists.forEach((l) => {
    console.log(`${l.url}...`)
    const filterFn = getListFilterFunction(l.uuid)
    promises.push(getListBufferFromURL(l.url, filterFn))
  })
  let p = Promise.all(promises)
  p = p.then((listBuffers) => {
    generateDataFileFromString(listBuffers, filename, 'default')
  })
  return p
}

const generateDataFilesForDefaultAdblock =
  generateDataFilesForList.bind(null, new lists("default"), 'rs-ABPFilterParserData.dat')

generateDataFilesForDefaultAdblock()
  .then(generateDataFilesForAllRegions)
  .then(() => {
    console.log('Thank you for updating the data files, don\'t forget to upload them too!')
  })
  .catch((e) => {
    console.error(`Something went wrong, aborting: ${e}`)
    process.exit(1)
  })

process.on('uncaughtException', (err) => {
  console.error('Caught exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
  process.exit(1)
})
