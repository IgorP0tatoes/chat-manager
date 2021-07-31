const { VK, StickerAttachment, AudioMessageAttachment, GraffitiAttachment } = require('vk-io');
const { HearManager } = require('@vk-io/hear')
const vk = new VK({
  token: "0caad84d388e4bed5d8c53776124f92edfb972bc7a4597832fab6630ccdc8e94843cd49ad7d4f9c9a9de3",
});
const bot = new HearManager();
var db = require('better-sqlite3')('database.db', { verbose: console.log });
createTable();

const createUserStatement = db.prepare('insert into players (id, peerId, nick, role, ban, warns, messages) values (?,?,?,?,?,?,?)');
createUser(460826153, 2000000003, "igor", 2, false, 0, 0);

const idid = getField('id', 460826153, 2000000003);
console.log(idid);

function createTable() {
  db.transaction(() => {
    db.exec(
      `create table if not exists players (
      id           integer not null,
      peerId       integer not null,
      nick         varchar(20),
      role         integer not null default 1,
      ban          boolean not null default false,
      warns        integer not null default 1,
      messages     integer not null default 0)`
    );
  })();
}

function createUser(id, peerId, nick, role, ban, warns, messages) {
  createUserStatement.run(id, peerId, nick, role, ban ? 1 : 0, warns, messages);
}

function getField(column, uid, pid) {
  return db.prepare('select ' + column + ' from players where id=? and peerId=?').get([ uid, pid ]);
}


async function getNames(userids) {
    let getFullName = await vk.api.users.get({ user_ids: userids, fields: "first_name, last_name"});
    return getFullName.map(x => x.first_name + " " + x.last_name);
}

async function getName(userid) {
  return (await getNames(userid))[0];
}

vk.updates.on('message', async (msg, context) => {
  const user = getUser(msg.senderId, msg.peerId);
  if (msg.senderId > 0) getName(msg.senderId).then(fullName => console.log("От @id" + msg.senderId + "(" + fullName + ") : " + msg.text));

  if ((user.role == 1) && (msg.attachments.some(x => x instanceof StickerAttachment))) {
    user.warns++;
    getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за стикер [` + user.warns + `/3]`));
  }
  if ((user.role == 1) && (msg.attachments.some(x => x instanceof AudioMessageAttachment))) {
    user.warns++;
    getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за голосовое сообщение [` + user.warns + `/3]`));  }
  if ((user.role == 1) && (msg.attachments.some(x => x instanceof GraffitiAttachment))) {
    user.warns++;
    getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за граффити [` + user.warns + `/3]`));  }
  if (user.warns == 3) {
    msg.send("Три варна, бб");
    user.warns = 0;
    vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: user.id});
  }

  return context();
});

vk.updates.on('message', bot.middleware);

vk.updates.on('chat_invite_user', (msg, context) => {
  const user = getUser(msg.eventMemberId ,msg.peerId);
  console.log(user);
  if (user.ban) {
    msg.send(`Пользователь @id${user.id} забанен!`);
    vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: user.id })
  }
  return context();
});

bot.hear(/^(?:!warn|!варн)$/i, (msg, next) => {
    const user = getUser(msg.senderId, msg.peerId);
    const u = getUser(msg.replyMessage.senderId, msg.peerId);

    if (user.role == 1) return msg.send("Нет прав");
    if (user.id == u.id) return msg.send("Че дебил сам себе варн давать");
    if (u.role >= user.role) return msg.send("Нельзя");

    u.warns++;
    getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `получил предупреждение [` + u.warns + `/3]`));

    if (u.warns == 3) {
      msg.send("Три варна, бб");
      u.warns = 0;
      vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: u.id });
    };

    return next();
});

bot.hear(/^(?:!kick|!кик)$/i, msg => {
    const user = getUser(msg.senderId, msg.peerId);
    const u = getUser(msg.replyMessage.senderId, msg.peerId);

    if (user.role == 1) return msg.send("Нет прав");
    if (user.id == u.id) return msg.send("Че дебил самого себя кикать");
    if (u.role >= user.role) return msg.send("Нельзя");

    u.warns = 0;
    getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `был кикнут из беседы`));
    vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: u.id});
});

bot.hear(/^(?:!ban|!бан)$/i, msg => {
    const user = getUser(msg.senderId, msg.peerId);
    const u = getUser(msg.replyMessage.senderId, msg.peerId);

    if (user.role == 1) return msg.send("Нет прав");
    if (user.id == u.id) return msg.send("Че дебил самого себя банить");
    if (u.role >= user.role) return msg.send("Нельзя");
    if (u.ban) return getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `уже забанен`));;

    u.ban = true;
    u.warns = 0;
    getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `получил бан`));
    vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: u.id});
});

bot.hear(/^(?:!unban|!разбан)$/i, msg => {
    const user = getUser(msg.senderId, msg.peerId);
    const u = getUser(msg.replyMessage.senderId, msg.peerId);

    if (user.role == 1) return msg.send("Нет прав");
    if (user.id == u.id) return msg.send("Ты и так не в бане ало");
    if (u.role >= user.role) return msg.send("Нельзя");
    if (!u.ban) return getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `не забанен`));

    u.ban = false;

    getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `разбанен`));
});

bot.hear(/^(?:!unwarn|!разварн|!унварн|!анварн)$/i, msg => {
    const user = getUser(msg.senderId, msg.peerId);
    const u = getUser(msg.replyMessage.senderId, msg.peerId);

    if (user.role == 1) return msg.send("Нет прав");
    if (user.id == u.id) return msg.send("Че дебил сам себе варн давать");
    if (u.role >= user.role) return msg.send("Нельзя");
    if (u.warns <= 0) return getName(msg.replyMessage.senderId).then(fullName => msg.send(`У пользователя @id${u.id}` + `(` + fullName + `) ` + `нет предупреждений`));
    u.warns--;
    getName(msg.replyMessage.senderId).then(fullName => msg.send(`С пользователя @id${u.id}` + `(` + fullName + `) ` + `снято предупреждение [` + u.warns + `/3]`));
});

bot.hear(/^(?:!report|!репорт)$/i, msg => {
    const user = getUser(msg.senderId, msg.peerId);
    const u = getUser(msg.replyMessage.senderId, msg.peerId);

    if (user.id == u.id) return msg.send("че дурак самого себя репортить");
    if (u.role == 2) return msg.send("Нельзя репортить админов");

    repCount++;
    getName(msg.replyMessage.senderId).then(fullName => msg.send(`Жалоба на @id${u.id}` + `(` + fullName + `) ` + `успешно отправлена!`));
    vk.api.messages.send({user_id: 460826153, message: `ало игорб привет там репорт на @id${u.id}`, random_id: Math.floor(Math.random() * 2000000),
    peer_id: msg.peerId, forward: JSON.stringify({ peer_id: msg.peerId, conversation_message_ids: msg.conversationMessageId, is_reply: 0 })});
    vk.api.messages.send({user_id: 220944687, message: `ало изюм привет там репорт на @id${u.id}`, random_id: Math.floor(Math.random() * 2000000),
    peer_id: msg.peerId, forward: JSON.stringify({ peer_id: msg.peerId, conversation_message_ids: msg.conversationMessageId, is_reply: 0 })});
    vk.api.messages.send({user_id: 467495261, message: `ало насьтя привет там репорт на @id${u.id}`, random_id: Math.floor(Math.random() * 2000000),
    peer_id: msg.peerId, forward: JSON.stringify({ peer_id: msg.peerId, conversation_message_ids: msg.conversationMessageId, is_reply: 0 })});
}); 

bot.hear(/^(?:!stats|!стата|!статистика)$/i, msg => {
  const user = getUser(msg.senderId, msg.peerId);

  if (user.role == 1) return getName(msg.senderId).then(fullName => msg.send(`@id${user.id}` + `(` + fullName + `)\n` + `Количество варнов: ` + user.warns));
  msg.send("Всего в базе беседы: " + users.filter(x => x.peerId == msg.peerId).length + " человек");
});

bot.hear(/^(?:!команды|!кмд)$/i, msg => {
    const user = getUser(msg.senderId, msg.peerId);

    if (user.role == 1) return msg.send("Нет прав");

    msg.send(`Список команд:
      !варн !warn - выдать предупреждение пользователю
      !кик !kick - выгнать пользователя из беседы (есть возможность вернуть)
      !бан !ban - забанить пользователя в беседе (при возврате будет авто-кик)
      !разбан !unban - разбанить пользователя
      !репорт !report - пожаловаться на пользователя
      !стата !статистика !stats - посмотреть статистику
      !разварн !анварн !унварн !unwarn - снять предупреждение с пользователя
      !изнас !iznas - изнасиловать пользователя`);
});

bot.hear(/^(?:!id|!ид|!айди)$/i, (msg, gey) => {
    const user = getUser(msg.senderId, msg.peerId);
    const u = getUser(msg.replyMessage.senderId, msg.peerId);
    var getId = msg.replyMessage.conversationMessageId;

    if (user.role == 1) return msg.send("Нет прав");
    getId = msg.replyMessage.conversationMessageId;
    msg.send(getId);
    
});

bot.hear(/^(?:!изнас|!iznas)$/i, async msg => {
    const user = getUser(msg.senderId, msg.peerId);
    if (user.role == 1) return msg.send("Нет прав");
    const u = getUser(msg.replyMessage.senderId, msg.peerId);
    const senderName = await getName(msg.senderId);
    const replyName  = await getName(msg.replyMessage.senderId);
    msg.send(`@id${u.id}` + `(` + replyName + `) ` + `был изнасилован игроком @id${user.id}` + `(` + senderName + `)`);
});

bot.hear(/^(?:ты)$/i, msg => {
    vk.api.messages.send({message: "нет ты", random_id: Math.floor(Math.random() * 2000000),
    peer_id: msg.peerId, forward: JSON.stringify({ peer_id: msg.peerId, conversation_message_ids: msg.conversationMessageId, is_reply: 1 })});
});

bot.hear(/^(?:!banlist|!банлист)$/i, async msg => {
  const banned = users.filter(x => x.ban && x.peerId == msg.peerId).map(x => x.id);
  const names = await getNames(banned);

  msg.send(banned.map((x, i) => "@id" + x + " (" + names[i] + ")").join(", ") +
    "\n Всего забанено: " + banned.length + " человек");
});

console.log("started");
vk.updates.start().catch(console.error);