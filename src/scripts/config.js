export default {
  modules: {
    development: {
      // Number of simulation cycles the road must fail the abandonment
      // criteria before it has a chance of becoming abandoned
      abandonThreshold: 10,     
      // Probability of building being abandoned after it has met the
      // abandonment criteria for 'delay' cycles
      abandonChance: 0.25,  
      // Number of days it takes to build a building
      constructionTime: 0,
      // Probability of a building leveling up
      levelUpChance: 0.05,
      // Probability of building being re-developed after it is no longer
      // meeting the abandonment criteria
      redevelopChance: 1.0,         
    },
    jobs: {
      // Max # of workers at a building
      maxWorkers: 2,       
    },
    residents: {
      // Max # of residents in a house
      maxResidents: 2,         
      // Chance for a resident to move in
      residentMoveInChance: 0.5,
    },
    roadAccess: {
      // Max distance to search for a road when determining road access
      searchDistance: 3       
    },
  },
  citizen: {
     // Minimum working age for a citizen
    minWorkingAge: 16,       
     // Age when citizens retire
    retirementAge: 65,       
    // Max Manhattan distance a citizen will search for a job
    maxJobSearchDistance: 4   
  },
  vehicle: {
    // The distance travelled per millisecond
    speed: 0.0005,
    // The start/end time where the vehicle should fade
    fadeTime: 500,
    // Maximum lifetime of a vehicle (controls max # of vehicles on screen)
    maxLifetime: 10000,
    // How often vehicles are spawned in milliseconds
    spawnInterval: 1000
  },
  disaster: {
    // Minimum number of buildings before disasters can occur
    minBuildingsForDisaster: 8,
    // Minimum sim ticks between disasters
    minTicksBetweenDisasters: 60,
    // Probability of disaster per tick (when conditions met)
    disasterChance: 0.02,
    // Minimum affected area size
    minAffectedSize: 2,
    // Maximum affected area size
    maxAffectedSize: 3,
    // Min ticks for full recovery (5 minutes)
    minRecoveryTicks: 300,
    // Max ticks for full recovery (10 minutes)
    maxRecoveryTicks: 600,
    // Speed multiplier when actively recovering via recover_tile command
    activeRecoveryMultiplier: 5,
  },
}
