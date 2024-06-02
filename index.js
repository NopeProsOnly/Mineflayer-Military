const fs = require('fs')
const util = require('util')
const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder
const Movements = require('mineflayer-pathfinder').Movements
const goals = require('mineflayer-pathfinder').goals
const armorManager = require('mineflayer-armor-manager')
const pvp = require('mineflayer-pvp').plugin
const autoeat = require('mineflayer-auto-eat').plugin
const bloodhound = require('mineflayer-bloodhound')(mineflayer)
const vec3 = require('vec3')
const blames = [
    "That's not fair, I lagged",
    "Darn it, I miss clicked",
    "You cheated!",
    "You just have a better computer",
    "My sensitivity was just too high",
    "My mouse disconnected",
    "I want a rematch"
]
const readFile = (fileName) => util.promisify(fs.readFile)(fileName, 'utf8')

const config = {
    //host: ip address of server you want the bots to connect to 
    //or localhost for a server or world hosted on the local machine
    host: 'localhost',
    //port: the port of the server you want the bots to connect to
    //they will usually be 25565 by default
    port: 25565,
    //file: ./filename with account names. Make sure that you have the
    //names on seperate lines.
    file: './accounts.txt',
    //interval: the number of milliseconds to wait between joins
    //used to prevent joining servers too quickly
    interval: 500
}

let lastPot = Date.now()
const accounts = []
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
            bot.loadPlugin(autoeat)
            bloodhound(bot)
            bot.bloodhound.yaw_correlation_enabled = true


            bot.on('spawn', () => {
                resolve(bot)
                accounts.push(bot.username)
            })
            //bot actions go below this line
            
            bot.on('onCorrelateAttack', function(attacker) {
                if(attacker.type === 'player' && !accounts.includes(attacker.username)) {
                    bot.pvp.attack(bot.players[attacker.username].entity)
                }
            })


            bot.on('death', () => {
                const random = Math.floor(Math.random() * blames.length);
                bot.chat(blames[random]);
            })
            
            //this makes the bot equip sword and shields
            bot.on('playerCollect', (collector, itemDrop) => {
                if(collector !== bot.entity) return
                //equip shield and sword
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
                //look at nearest entity for flavor
                if (bot.blockAt(bot.entity.position).name !== 'cobweb' || bot.player.entity.effects['1']) {
                    if (bot.nearestEntity()) bot.lookAt(bot.nearestEntity().position.offset(0, bot.nearestEntity().height, 0))
                }
                if (!guardPos) return
                //attack nearest entity
                const filter = e => (e.type === 'mob' || e.type === 'hostile') && e.position.distanceTo(bot.entity.position) < 16 && e.displayName !== 'Armor Stand' && e.displayName !== 'Item'
                const entity = bot.nearestEntity(filter)
                if(entity) {
                    bot.pvp.attack(entity)
                }
            })

            bot.on('move', () => {
                const block = bot.blockAt(bot.entity.position)
                const previousItem = bot.heldItem
                const splashPotion = bot.inventory.items().filter(item => item.name === 'splash_potion')
                const order = ['strong', 'long', 'regular']
                splashPotion.sort((a, b) => {
                    const aType = a.nbt.value.Potion ? a.nbt.value.Potion.value : ''
                    const bType = b.nbt.value.Potion ? b.nbt.value.Potion.value : ''

                    const aOrder = order.find(o => aType.includes(o)) || 'regular'
                    const bOrder = order.find(o => bType.includes(o)) || 'regular'

                    return order.indexOf(aOrder) - order.indexOf(bOrder);
                })
                
                const speed = splashPotion.find(item => item.nbt && item.nbt.value.Potion && item.nbt.value.Potion.value.includes("swiftness"));
                if (bot.pvp.target) {
                    var preTarget = bot.pvp.target
                }
                if (block && block.name === 'cobweb') {
                    console.log('cobweb')
                    if(!bot.player.entity.effects['1'] && (Date.now() - lastPot) > 3000) {
                        if (speed) {
                            bot.pvp.forceStop()
                            lastPot = Date.now()
                            bot.equip(speed, 'hand')
                            bot.lookAt(bot.entity.position.offset(0,2,0),true)
                            setTimeout(() => {
                                bot.activateItem()
                                setTimeout(() => {
                                    if (previousItem) {
                                        bot.equip(previousItem.type, 'hand')
                                    }
                                    bot.pvp.attack(preTarget)
                                    console.log(preTarget)
                                }, 450)
                            }, 500)
                        }
                    }
                }               
            })

            bot.on('chat', (username, message) => {
                if (message === 'target') {
                    if (bot.pvp.target) {
                        console.log(bot.pvp.target.username)
                    }
                }
                if (message === `${bot.username} guard`) {
                    const player = bot.players[username]
                    if (!player) {
                        bot.chat('I can\'t find you')
                        return
                    }
                    bot.chat('I will guard that position')
                    guardArea(player.entity.position)
                }
                if (message === `fight me`) {
                    const player = bot.players[username]
                    if(!player) {
                        return
                    }
                    bot.pvp.attack(player.entity)
                }
                if (message === 'stop'){
                    stopGuarding()
                }
                if (message === 'equip'){
                    setTimeout(() => {
                        const sword = bot.inventory.items().find(item=> item.name.includes('sword'))
                        if (sword) bot.equip(sword, 'hand')
                    }, 150)
                    setTimeout(() => {
                        const shield = bot.inventory.items().find(item => item.name.includes('shield'))
                        if (shield) bot.equip(shield, 'off-hand')
                    }, 250)
                    bot.armorManager.equipAll()
                }
            })
            //bot actions go above this line
            bot.on('error', console.log)
            bot.on('kicked', console.log)
            bot.on('end', console.log)
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