const { VK, StickerAttachment, AudioMessageAttachment, GraffitiAttachment } = require('vk-io');
const { HearManager } = require('@vk-io/hear')
const vk = new VK({
  token: "0caad84d388e4bed5d8c53776124f92edfb972bc7a4597832fab6630ccdc8e94843cd49ad7d4f9c9a9de3",
});
const bot = new HearManager();
var db = require('better-sqlite3')('database.db', { verbose: console.log });
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

const createUserStatement         = db.prepare('insert into players (id, peerId, nick, role, ban, warns, messages) values (?,?,?,?,?,?,?)');
const updateUserStatement         = db.prepare('update players set nick=?, role=?, ban=?, warns=?, messages=? where id=? and peerId=?');
const getUserCountStatement       = db.prepare('select count() from players where id=? and peerId=?');
const getPeerUserCountStatement   = db.prepare('select count() from players where peerid=?');
const loadUserStatement           = db.prepare('select * from players where id=? and peerId=?');
const getBanlistStatement         = db.prepare('select * from players where peerid=? and ban=1');

const users = [];



function getOrCreateUserDefault(id, peerId) {
  return getOrCreateUser(id, peerId, "", 1, false, 0, 0);
}
function getOrCreateUser(id, peerId, nick, role, ban, warns, messages) {
  const loaded = tryGetLoadedUser(id, peerId);
  if (loaded) return loaded;

  const count = getUserCountStatement.get(id, peerId);
  if (count["count()"] == 0)
    return createUser(id, peerId, nick, role, ban, warns, messages);
  return loadUser(id, peerId);
}
function createUser(id, peerId, nick, role, ban, warns, messages) {
  createUserStatement.run(id, peerId, nick, role, ban ? 1 : 0, warns, messages);

  const user = loadUser(id, peerId);
  vk.api.messages.getConversationMembers({ peer_id: peerId }).then(x => {
	console.log(x);
    if (x.items.filter(x => x.member_id == user.id)[0].is_admin) {
      user.role = 2;
      saveUser(user);
    }
  });

  return user;
}

function tryGetLoadedUser(id, peerId){
  var peers = users[peerId];
  if (peers) {
    const user = peers[id];
    if (user)
      return user;
  }

  return null;
}
function getUser(id, peerId) {
  const loaded = tryGetLoadedUser(id, peerId);
  if (loaded) return loaded;

  return getOrCreateUserDefault(id, peerId);
}
function loadUser(id, peerId) {
  if (!users[peerId]) users[peerId] = [];
  return users[peerId][id] = loadUserStatement.get(id, peerId);
}

function saveUser(user) {
  updateUserStatement.run(user.nick, user.role, user.ban, user.warns, user.messages, user.id, user.peerId);
}


async function getNames(userids) {
  let getFullName = await vk.api.users.get({ user_ids: userids, fields: "first_name, last_name" });
  return getFullName.map(x => x.first_name + " " + x.last_name);
}
async function getName(userid) {
  return (await getNames(userid))[0];
}

vk.updates.on('message', async (msg, context) => {
  const user = getUser(msg.senderId, msg.peerId);
  if (msg.senderId > 0) getName(msg.senderId).then(fullName => console.log("От @id" + msg.senderId + "(" + fullName + ") : " + msg.text));

  if ((user.role == 1) && (msg.peerId == 2000000003) && (msg.attachments.some(x => x instanceof StickerAttachment))) {
    user.warns++;
    saveUser(user);
    getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за стикер [` + user.warns + `/3]`));
  }
  if ((user.role == 1) && (msg.peerId == 2000000003) && (msg.attachments.some(x => x instanceof AudioMessageAttachment))) {
    user.warns++;
    saveUser(user);
    getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за голосовое сообщение [` + user.warns + `/3]`));
  }
  if ((user.role == 1) && (msg.peerId == 2000000003) && (msg.attachments.some(x => x instanceof GraffitiAttachment))) {
    user.warns++;
    saveUser(user);
    getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за граффити [` + user.warns + `/3]`));
  }
  if (user.warns == 3) {
    msg.send("Три варна, бб");
    user.warns = 0;
    saveUser(user);
    vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: user.id });
  }

  return context();
});

vk.updates.on('message', bot.middleware);

vk.updates.on('chat_invite_user', (msg, context) => {
  const user = getUser(msg.eventMemberId, msg.peerId);
  console.log(user);
  if (user.ban) {
    getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `забанен!`));
    vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: user.id })
  }
  return context();
});

bot.hear(/^(?:!warn|!варн)$/i, (msg, next) => {
  const user = getUser(msg.senderId, msg.peerId);
  const u = getUser(msg.replyMessage.senderId, msg.peerId);

  if (user.role == 1) return msg.send("Нет прав");
  if (user.id == u.id) return msg.send("дурак чтоли самому себе варн давать");
  if (u.role >= user.role) return msg.send("Нельзя");

  u.warns++;
  saveUser(u);
  getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `получил предупреждение [` + u.warns + `/3]`));

  if (u.warns == 3) {
    msg.send("Три варна, бб");
    u.warns = 0;
    vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: u.id });
    saveUser(u);
  };

  return next();
});

bot.hear(/^(?:!kick|!кик)$/i, msg => {
  const user = getUser(msg.senderId, msg.peerId);
  const u = getUser(msg.replyMessage.senderId, msg.peerId);

  if (user.role == 1) return msg.send("Нет прав");
  if (user.id == u.id) return msg.send("дурак чтоли самого себя кикать");
  if (u.role >= user.role) return msg.send("Нельзя");

  u.warns = 0;
  saveUser(u);

  getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `был кикнут из беседы`));
  vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: u.id });
});

bot.hear(/^(?:!ban|!бан)$/i, msg => {
  const user = getUser(msg.senderId, msg.peerId);
  const u = getUser(msg.replyMessage.senderId, msg.peerId);

  if (user.role == 1) return msg.send("Нет прав");
  if (user.id == u.id) return msg.send("дурак чтоли самого себя банить");
  if (u.role >= user.role) return msg.send("Нельзя");
  if (u.ban) return getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `уже забанен`));;

  u.ban = true;
  u.warns = 0;
  saveUser(u);

  getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `получил бан`));
  vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: u.id });
});

bot.hear(/^(?:!unban|!разбан)$/i, msg => {
  const user = getUser(msg.senderId, msg.peerId);
  const u = getUser(msg.replyMessage.senderId, msg.peerId);

  if (user.role == 1) return msg.send("Нет прав");
  if (user.id == u.id) return msg.send("Ты и так не в бане ало");
  if (u.role >= user.role) return msg.send("Нельзя");
  if (!u.ban) return getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `не забанен`));

  u.ban = false;
  saveUser(u);

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
  saveUser(u);

  getName(msg.replyMessage.senderId).then(fullName => msg.send(`С пользователя @id${u.id}` + `(` + fullName + `) ` + `снято предупреждение [` + u.warns + `/3]`));
});

/* bot.hear(/^(?:!report|!репорт)$/i, msg => {
  const user = getUser(msg.senderId, msg.peerId);
  const u = getUser(msg.replyMessage.senderId, msg.peerId);

  if (user.id == u.id) return msg.send("че дурак самого себя репортить");
  if (u.role == 2) return msg.send("Нельзя репортить админов");

  repCount++;
  getName(msg.replyMessage.senderId).then(fullName => msg.send(`Жалоба на @id${u.id}` + `(` + fullName + `) ` + `успешно отправлена!`));
  vk.api.messages.send({
    user_id: 460826153, message: `ало игорб привет там репорт на @id${u.id}`, random_id: Math.floor(Math.random() * 2000000),
    peer_id: msg.peerId, forward: JSON.stringify({ peer_id: msg.peerId, conversation_message_ids: msg.conversationMessageId, is_reply: 0 })
  });
  vk.api.messages.send({
    user_id: 220944687, message: `ало изюм привет там репорт на @id${u.id}`, random_id: Math.floor(Math.random() * 2000000),
    peer_id: msg.peerId, forward: JSON.stringify({ peer_id: msg.peerId, conversation_message_ids: msg.conversationMessageId, is_reply: 0 })
  });
  vk.api.messages.send({
    user_id: 467495261, message: `ало насьтя привет там репорт на @id${u.id}`, random_id: Math.floor(Math.random() * 2000000),
    peer_id: msg.peerId, forward: JSON.stringify({ peer_id: msg.peerId, conversation_message_ids: msg.conversationMessageId, is_reply: 0 })
  });
}); */

bot.hear(/^(?:!stats|!стата|!статистика)$/i, msg => {
  const user = getUser(msg.senderId, msg.peerId);
  if (user.role == 1) return getName(msg.senderId).then(fullName => msg.send(`@id${user.id}` + `(` + fullName + `)\n` + `Количество варнов: ` + user.warns));

  const count = getPeerUserCountStatement.get(msg.peerId);
  msg.send("Всего в базе беседы: " + count["count()"] + " человек");
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
  const replyName = await getName(msg.replyMessage.senderId);
  msg.send(`@id${u.id}` + `(` + replyName + `) ` + `был изнасилован игроком @id${user.id}` + `(` + senderName + `)`);
});

bot.hear(/^(?:!админ|!адм|!admin)$/i, async msg => {
  const user = getUser(msg.senderId, msg.peerId);
  const u = getUser(msg.replyMessage.senderId, msg.peerId);
  const replyName = await getName(msg.replyMessage.senderId);

  if (user.role == 1) return msg.send("Нет прав");
  if (user.id == u.id) return msg.send("дурак чтоли админку с себя снимать");
  if (u.role == 1) {
    u.role = 2;
    saveUser(u);
    return msg.send(`Пользователю @id${u.id}` + `(` + replyName + `) ` + `выдана админка`);
  }
  if (u.role == 2) {
    u.role = 1;
    saveUser(u);
    return msg.send(`У пользователя @id${u.id}` + `(` + replyName + `) ` + `забрана админка`);
  }
});

bot.hear(/^(?:!banlist|!банлист)$/i, async msg => {
  const banned = getBanlistStatement.all(msg.peerId).map(x => x.id);
  const names = await getNames(banned);

  msg.send(banned.map((x, i) => "@id" + x + " (" + names[i] + ")").join(", ") +
    "\n Всего забанено: " + banned.length + " человек");
});

bot.hear(/^(?:!команды|!кмд)$/i, msg => {
  const user = getUser(msg.senderId, msg.peerId);

  if (user.role == 1) return msg.send("Нет прав");

  msg.send(`Список команд:
      !кмд !команды - список команд
      !варн !warn - выдать предупреждение пользователю
      !кик !kick - выгнать пользователя из беседы (есть возможность вернуть)
      !бан !ban - забанить пользователя в беседе (при возврате будет авто-кик)
      !разбан !unban - разбанить пользователя
      !стата !статистика !stats - посмотреть статистику
      !разварн !анварн !унварн !unwarn - снять предупреждение с пользователя
      !изнас !iznas - изнасиловать пользователя
      !ид !айди !is - получить conversationId сообщения
      !адм !админ !admin - выбрать/забрать админку`);
});

console.log("started");
vk.updates.start().catch(console.error);
