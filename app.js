const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    if (require.main === module) {
      app.listen(3000, () => {
        console.log('Server Running At http://localhost:3000')
      })
    }
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

const convertStateObjectResponseObject = db => {
  return {
    stateId: db.state_id,
    stateName: db.stateName,
  }
}

const convertDistrictObjectResponseObject = db => {
  return {
    districtId: db.district_id,
  }
}

// Middleware to authenticate token
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers['authorization']
  if (authHeader === undefined) {
    response.status(401).send('Invalid JWT Token')
  } else {
    const jwtToken = authHeader.split(' ')[1]
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', (error, payload) => {
      if (error) {
        response.status(401).send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

// API 1: Login
app.post('/login/', async (req, res) => {
  try {
    const {username, password} = req.body
    const selectUserQuery = `
      SELECT * FROM user WHERE username = ?;
    `
    const dbUser = await db.get(selectUserQuery, [username])

    if (!dbUser) {
      res.status(400).send('Invalid user') // Use 400 for "Bad Request" as per test case
    } else {
      const isPasswordValid = await bcrypt.compare(password, dbUser.password)
      if (isPasswordValid) {
        const payload = {username}
        const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
        res.send({jwtToken})
      } else {
        res.status(400).send('Invalid password') // Use 400 for "Bad Request"
      }
    }
  } catch (error) {
    res.status(500).send({error: 'Internal Server Error'})
  }
})

// API 2: Get all states
app.get('/states/', authenticateToken, async (req, res) => {
  try {
    const getStatesQuery = `
      SELECT 
        state_id AS stateId, 
        state_name AS stateName, 
        population 
      FROM state;
    `
    const states = await db.all(getStatesQuery)
    res.send(states)
  } catch (error) {
    res.status(500).send({error: 'Internal Server Error'})
  }
})

// API 3: Get state by ID
app.get('/states/:stateId/', authenticateToken, async (req, res) => {
  const {stateId} = req.params
  try {
    const getStateQuery = `
      SELECT 
        state_id AS stateId, 
        state_name AS stateName, 
        population 
      FROM state 
      WHERE state_id = ?;
    `
    const state = await db.get(getStateQuery, [stateId])
    if (state) {
      res.send(state)
    } else {
      res.status(404).send('State not found')
    }
  } catch (error) {
    res.status(500).send({error: 'Internal Server Error'})
  }
})

// API 4: Add district
app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const addDistrictQuery = `
    INSERT INTO district (district_name, state_id, cases, cured, active, deaths)
    VALUES (?, ?, ?, ?, ?, ?);
  `
  await db.run(addDistrictQuery, [
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  ])
  response.send('District Successfully Added')
})

// API 5: Get district by ID
app.get('/districts/:districtId/', authenticateToken, async (req, res) => {
  const {districtId} = req.params
  try {
    const getDistrictQuery = `
      SELECT 
        district_id AS districtId, 
        district_name AS districtName, 
        state_id AS stateId, 
        cases, 
        cured, 
        active, 
        deaths 
      FROM district 
      WHERE district_id = ?;
    `
    const district = await db.get(getDistrictQuery, [districtId])
    if (district) {
      res.send(district)
    } else {
      res.status(404).send('District not found')
    }
  } catch (error) {
    res.status(500).send({error: 'Internal Server Error'})
  }
})

// API 6: Delete district by ID
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    try {
      const deleteDistrictQuery = `DELETE FROM district WHERE district_id = ?;`
      await db.run(deleteDistrictQuery, [districtId])
      response.send('District Removed')
    } catch (e) {
      console.log(e)
    }
  },
)

// API 7: Update district
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    try {
      const updateDistrictQuery = `
    UPDATE district 
    SET district_name = ?, state_id = ?, cases = ?, cured = ?, active = ?, deaths = ?
    WHERE district_id = ?;
  `
      await db.run(updateDistrictQuery, [
        districtName,
        stateId,
        cases,
        cured,
        active,
        deaths,
        districtId,
      ])
      response.send('District Details Updated')
    } catch (e) {
      console.log(e)
    }
  },
)

// API 8: Get state statistics
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    try {
      const getStatsQuery = `
    SELECT 
      SUM(cases) AS totalCases,
      SUM(cured) AS totalCured,
      SUM(active) AS totalActive,
      SUM(deaths) AS totalDeaths
    FROM district
    WHERE state_id = ?;
  `
      const stats = await db.get(getStatsQuery, [stateId])
      response.send(stats)
    } catch (e) {
      console.log(e)
    }
  },
)

module.exports = app
