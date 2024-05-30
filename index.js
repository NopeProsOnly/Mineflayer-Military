const fs = require('fs')
const util = require('util')
const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder
const Movements = require('mineflayer-pathfinder').Movements
const goals = require('mineflayer-pathfinder').goals
const armorManager = require('mineflayer-armor-manager')
const pvp = require('mineflayer-pvp').plugin
const readFile = (fileName) => util.promisify(fs.readFile)(fileName, 'utf8')

const config = {
    //host: ip address of server you want the bots to connect to 
    //or localhost for a server or world hosted on the local machine
    host: 'localhost',
    //port: the port of the server you want the bots to connect to
    //they will usually be 25565 by default
    port: 58114,
    //file: ./filename with account names. Make sure that you have the
    //names on seperate lines.
    file: './accounts.txt',
    //interval: the number of milliseconds to wait between joins
    //used to prevent joining servers too quickly
    interval: 500
}

function makeBot (_u, ix) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const bot = mineflayer.createBot({
                username: _u,
                auth: 'offline',
                host: config.host,
                port: config.port
            })
            //load plugins
            bot.loadPlugin(pathfinder)
            bot.loadPlugin(pvp)
            bot.loadPlugin(armorManager)

            bot.on('spawn', () => resolve(bot))
            //bot actions go below this line
            
            //this makes the bot equip sword and shields
            bot.on('playerCollect', (collector, itemDrop) => {
                if(collector !== bot.entity) return

                setTimeout(() => {
                    const sword = bot.inventory.items().find(item=> item.name.includes('sword'))
                    if (sword) bot.equip(sword, 'hand')
                }, 150)
                setTimeout(() => {
                    const shield = bot.inventory.items().find(item => item.name.includes('shield'))
                    if (shield) bot.equip(shield, 'off-hand')
                }, 250)
            })
            //Guarding a position
            let guardPos = null
            function guardArea(pos) {
                guardPos = pos.clone()
                if (!bot.pvp.target) {
                    moveToGuardPos()
                }
            }
            function stopGuarding() {
                guardPos = null
                bot.pvp.stop()
                bot.pathfinder.setGoal(null)
            }
            function moveToGuardPos() {
                const mcData = require('minecraft-data')(bot.version)
                bot.pathfinder.setMovements(new Movements(bot, mcData))
                bot.pathfinder.setGoal(new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z))
            }
            bot.on('stoppedAttacking', () => {
                if(guardPos) {
                    moveToGuardPos()
                }
            })
            //attacking mobs in a 16 radius of the position
            bot.on('physicsTick', () => {
                if (bot.pvp.target) return
                if (bot.pathfinder.isMoving()) return
              
                const entity = bot.nearestEntity()
                if (entity) bot.lookAt(entity.position.offset(0, entity.height, 0))
            if (!guardPos) return
                const filter = e => e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 16 && e.mobtype !== 'ArmorStand'
                const entity1 = bot.nearestEntity(filter)
                if(entity1) {
                    bot.pvp.attack(entity1)
                }
            })

            bot.on('chat', (username, message) => {
                if (message === `${bot.username} guard`) {
                    const player = bot.players[username]
                    if (!player) {
                        bot.chat('I can\'t find you')
                        return
                    }
                    bot.chat('I will guard that position')
                    guardArea(player.entity.position)
                }
                if (message === `${bot.username} fight me`) {
                    const player = bot.players[username]
                    if(!player) {
                        bot.chat('I can\'t find you')
                        return
                    }
                    bot.chat('Prepeare to die!')
                    bot.pvp.attack(player.entity)
                }
                if (message === 'stop'){
                    stopGuarding()
                }
            })
            //bot actions go above this line
            bot.on('error', console.log)
            bot.on('kicked', console.log)
        }, config.interval * ix)
    })
}

async function main() {
    const file = await readFile(config.file)
    const accounts = file.split(/\r?\n/)
    const botProms = accounts.map(makeBot)
    const bots = (await Promise.allSettled(botProms)).map(({ value, reason }) => value || reason).filter(value => !(value instanceof Error))
    console.log(`Bots (${bots.length} / ${accounts.length}) successfully logged in.`)
}

main()