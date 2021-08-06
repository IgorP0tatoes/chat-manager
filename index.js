const { VK, StickerAttachment, AudioMessageAttachment, GraffitiAttachment, DocAttachment,
  PhotoAttachment, VideoAttachment, AudioAttachment, PollAttachment } = require('vk-io');
const { HearManager } = require('@vk-io/hear');
const fs = require('fs');
let config = require('./config.json');
const vk = new VK({ token: config.token });
const bot = new HearManager();
var db = require('better-sqlite3')('database.db');

//#region db

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
  db.exec(
    `create table if not exists settings (
    peerId       integer not null primary key unique,
    photo        boolean not null default false,
    video        boolean not null default false,
    audio        boolean not null default false,
    graffiti     boolean not null default false,
    sticker      boolean not null default false,
    audiomsg     boolean not null default false,
    poll         boolean not null default false,
    document     boolean not null default false,
    adminsId     text not null default "")`
  );
})();

const idKeys                    = ['id', 'peerId'];

const userKeys                  = Object.keys(userInstance(0, 0));
const userKeysNoIds             = userKeys.filter(x => !idKeys.includes(x));

const settingsKeys              = Object.keys(settingsInstance(0, 0));
const settingsKeysNoIds         = settingsKeys.filter(x => !idKeys.includes(x));

const createUserStatement       = db.prepare('insert into players (' + userKeys.join(", ") + ') values (' + userKeys.map(x => '?').join(", ") + ')');
const updateUserStatement       = db.prepare('update players set ' + userKeysNoIds.map(x => x + "=?").join(", ") + ' where id=? and peerId=?');
const getUserCountStatement     = db.prepare('select count() from players where id=? and peerId=?');
const getPeerUserCountStatement = db.prepare('select count() from players where peerid=?');
const loadUserStatement         = db.prepare('select * from players where id=? and peerId=?');
const getBanlistStatement       = db.prepare('select * from players where peerid=? and ban=1');

const loadSettingsStatement     = db.prepare('select * from settings where peerid=?');
const createSettingsStatement   = db.prepare('insert into settings (' + settingsKeys.join(", ") + ') values (' + settingsKeys.map(x => '?').join(", ") + ')');
const updateSettingsStatement   = db.prepare('update settings set ' + settingsKeysNoIds.map(x => x + "=?").join(", ") + ' where peerId=?');
const getSettingsCountStatement = db.prepare('select count() from settings where peerId=?');

const users = [];
const settings = [];


function mapObjectValue(value) {
  if (value === true) return 1;
  if (value === false) return 0;

  return value;
}

//#region  settings

function settingsInstance(pid) {
  return {
    peerId:   pid,
    photo:    false,
    video:    false,
    audio:    false,
    graffiti: false,
    sticker:  false,
    audiomsg: false,
    poll:     false,
    document: false,
    adminsId: "",
  };
}
function getSettings(peerId) {
  return settings[peerId] || getOrCreateSettings(peerId);


  function getOrCreateSettings(peerId) {
    const count = getSettingsCountStatement.get(peerId);
    if (count["count()"] == 0)
      return createSettings(settingsInstance(peerId));

      return settings[peerId] = loadSettingsStatement.get(peerId);


    function createSettings(settings) {
      createSettingsStatement.run(Object.values(settings).map(mapObjectValue));
      return peerId;
    }
  }
}
function saveSettings(settings) {
  const values = settingsKeysNoIds.map(x => mapObjectValue(settings[x]));
  values.push(settings.peerId);

  updateSettingsStatement.run(values);
}

//#endregion

function userInstance(uid, pid) {
  return {
    id: uid,
    peerId: pid,
    warns: 0,
    role: 1,
    ban: false,
    nick: '',
    messages: 0,
  };
}
function getUser(id, peerId) {
  return users[peerId]?.[id] || getOrCreateUser(id, peerId);


  function getOrCreateUser(id, peerId) {
    const count = getUserCountStatement.get(id, peerId);
    if (count["count()"] == 0)
      return createUser(userInstance(id, peerId));

    users[peerId] ??= [];
    return users[peerId][id] = loadUserStatement.get(id, peerId);


    function createUser(user) {
      createUserStatement.run(Object.values(user).map(mapObjectValue));

      vk.api.messages.getConversationMembers({ peer_id: user.peerId }).then(x => {
        if (x.items.filter(x => x.member_id == user.id)?.[0]?.is_admin || false) {
          user.role = 2;
          saveUser(user);
          if (user.id > 0) vk.api.messages.send({ message: `Выдача админ-прав прошла успешно`, random_id: Math.floor(Math.random() * 2000000), peer_id: user.peerId });
        }
      });
      return user;
    }
  }
}
function saveUser(user) {
  const values = userKeysNoIds.map(x => mapObjectValue(user[x]));
  values.push(user.id);
  values.push(user.peerId);

  updateUserStatement.run(values);
}

//#endregion


async function getNames(userids) {
  let getFullName = await vk.api.users.get({ user_ids: userids, fields: "first_name, last_name" });
  return getFullName.map(x => x.first_name + " " + x.last_name);
}
async function getName(userid) {
  return (await getNames(userid))[0];
}

vk.updates.on('message', async (msg, context) => {
  const user = getUser(msg.senderId, msg.peerId);
  const settings = getSettings(msg.peerId);
  if (msg.senderId > 0) getName(msg.senderId).then(fullName => console.log(msg.peerId + " | " + msg.senderId + " | " + fullName + ": " + msg.text));
  user.messages++;
  saveUser(user);
  if (msg.senderId == msg.peerId) msg.send("Привет! Как добавить бота в свою беседу можешь посмотреть здесь - https://vk.com/wall-206245485_2")
  if (user.role == 1) {
    if (settings.sticker && msg.attachments.some(x => x instanceof StickerAttachment)) {
      user.warns++;
      saveUser(user);
      getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за стикер [` + user.warns + `/3]`));
    }
    if (settings.audiomsg && msg.attachments.some(x => x instanceof AudioMessageAttachment)) {
      user.warns++;
      saveUser(user);
      getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за голосовое сообщение [` + user.warns + `/3]`));
    }
    if (settings.graffiti && msg.attachments.some(x => x instanceof GraffitiAttachment)) {
      user.warns++;
      saveUser(user);
      getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за граффити [` + user.warns + `/3]`));
    }
    if (settings.document && msg.attachments.some(x => x instanceof DocAttachment)) {
      user.warns++;
      saveUser(user);
      getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за отправку документа [` + user.warns + `/3]`));
    }
    if (settings.photo && msg.attachments.some(x => x instanceof PhotoAttachment)) {
      user.warns++;
      saveUser(user);
      getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за фото [` + user.warns + `/3]`));
    }
    if (settings.video && msg.attachments.some(x => x instanceof VideoAttachment)) {
      user.warns++;
      saveUser(user);
      getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за видео [` + user.warns + `/3]`));
    }
    if (settings.audio && msg.attachments.some(x => x instanceof AudioAttachment)) {
      user.warns++;
      saveUser(user);
      getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за аудио [` + user.warns + `/3]`));
    }
    if (settings.poll && msg.attachments.some(x => x instanceof PollAttachment)) {
      user.warns++;
      saveUser(user);
      getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил автоматическое предупреждение за создание опроса [` + user.warns + `/3]`));
    }
  }
  if (user.warns == 3) {
    getName(msg.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил третье предупреждение и был кикнут`));
    user.warns = 0;
    saveUser(user);
    vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: user.id });
  }

  return context();
});

vk.updates.on('message', bot.middleware);

vk.updates.on('chat_invite_user', (msg, context) => {
  const user = getUser(msg.eventMemberId, msg.peerId);
  if (user.ban) {
    getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `забанен!`));
    vk.api.messages.removeChatUser({ chat_id: msg.chatId, user_id: user.id })
  }
  return context();
});

bot.hear(/^(?:!warn|!варн) ?.*$/i, (msg, next) => {
  const user = getUser(msg.senderId, msg.peerId);
  const u = getUser(msg.replyMessage.senderId, msg.peerId);

  if (user.role == 1) return msg.send("Нет прав");
  if (user.id == u.id) return msg.send("дурак чтоли самому себе варн давать");
  if (u.role >= user.role) return msg.send("Нельзя");

  u.warns++;
  saveUser(u);
  getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${u.id}` + `(` + fullName + `) ` + `получил предупреждение [` + u.warns + `/3]`));

  if (u.warns == 3) {
    getName(msg.replyMessage.senderId).then(fullName => msg.send(`Пользователь @id${user.id}` + `(` + fullName + `) ` + `получил третье предупреждение и был кикнут`));
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

bot.hear(/^(?:!stats|!стата|!статистика|!профиль) ?.*$/i, msg => {
  const spt = msg.text.split(' ');
  const id = spt[1] || msg.senderId;
  const user = getUser(id, msg.peerId);

  if (user.role == 1) return getName(user.id).then(fullName => msg.send(`@id${user.id}` + `(` + fullName + `)` +
     `\nНик: ` + user.nick + `\nКоличество варнов: ` + user.warns + `\nВсего сообщений: ` + user.messages));

  const count = getPeerUserCountStatement.get(msg.peerId);
  msg.send("Ник: " + user.nick + "\nВсего в базе беседы: " + count["count()"] + " человек" + "\nВсего сообщений: " + user.messages);
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
  const u = getUser(msg.replyMessage.senderId, msg.peerId);
  const senderName = await getName(msg.senderId);
  const replyName = await getName(msg.replyMessage.senderId);
  const leftnick = u.nick == "" ? replyName : u.nick;
  const rightnick = user.nick == "" ? senderName : user.nick;

  if (user.id == u.id) return msg.send(`@id${u.id} (${leftnick}) изнасиловал сам себя`);
  if ((user.role == 1) && (u.role == 2)) return msg.send("Нельзя");

  msg.send(`@id${u.id}` + `(` + leftnick + `) ` + `был изнасилован игроком @id${user.id}` + `(` + rightnick + `)`);
});

bot.hear(/^(?:!послать|!fu|!fuckyou)$/i, async msg => {
  const user = getUser(msg.senderId, msg.peerId);
  const u = getUser(msg.replyMessage.senderId, msg.peerId);
  const senderName = await getName(msg.senderId);
  const replyName = await getName(msg.replyMessage.senderId);
  const leftnick = u.nick == "" ? replyName : u.nick;
  const rightnick = user.nick == "" ? senderName : user.nick;

  if (user.id == u.id) return msg.send(`@id${u.id} (${leftnick}) пошел нахуй`);
  if ((user.role == 1) && (u.role == 2)) return msg.send("Нельзя");

  msg.send(`@id${u.id}` + `(` + leftnick + `) ` + `был послан нахуй игроком @id${user.id}` + `(` + rightnick + `)`);
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

bot.hear(/^(?:!настройки) ?.*$/i, msg => {
  const spt = msg.text.split(' ');
  const user = getUser(msg.senderId, msg.peerId);
  const settings = getSettings(msg.peerId);
  var type;

  if (user.role == 1) return msg.send("Нет прав");
  if (spt[1] == null) return msg.send("Использование: !настройки <все/фото/видео/аудио/стикеры/голосовые/документы/граффити/опросы>" + 
    "\n\nОписание: Запрещает/разрешает присылать медиа");
  if (spt[1] == ("все" || "всё")) {
    settings.photo    = !settings.photo;
    settings.video    = !settings.video;
    settings.audio    = !settings.audio;
    settings.sticker  = !settings.sticker;
    settings.audiomsg = !settings.audiomsg;
    settings.document = !settings.document;
    settings.graffiti = !settings.graffiti;
    settings.poll     = !settings.poll;
  }
  else if (spt[1] == "фото")      type = "photo";
  else if (spt[1] == "видео")     type = "video";
  else if (spt[1] == "аудио")     type = "audio";
  else if (spt[1] == "стикеры")   type = "sticker";
  else if (spt[1] == "голосовые") type = "audiomsg";
  else if (spt[1] == "документы") type = "document";
  else if (spt[1] == "граффити")  type = "graffiti";
  else if (spt[1] == "опросы")    type = "poll";
  else return msg.send("Неизвестный параметр");

  settings[type] = !settings[type];
  saveSettings(settings);
  msg.send(spt[1] + (settings[type] ? " запрещены" : " разрешены"));
});

bot.hear(/^(?:!invitel) ?.*$/i, msg => {
  const spt = msg.text.split(' ');
  const user = getUser(msg.senderId, msg.peerId);

  if (user.role == 1) return msg.send("Нет прав");
  msg.send(vk.api.messages.getInviteLink({ peer_id: spt[1] }));
});

bot.hear(/^(?:!ник|!nick) ?.*$/i, msg => {
  const spt = msg.text.split(' ');
  const user = getUser(msg.senderId, msg.peerId);

  if (spt[1] == null) return msg.send("Использование: !ник <ник>\n" + "Описание: установить себе никнейм");
  if (spt[1].length > 20) {
    user.nick = null;
    return msg.send("Ошибка: макс. длина ника 20 символов");
  }
  user.nick = spt[1];
  saveUser(user);
  getName(msg.senderId).then(fullName =>  msg.send(`Установлен ник "` + user.nick + `" для пользователя @id${user.id} (` + fullName + `)`));
});

bot.hear(/^(?:!команды|!кмд|!помощь)$/i, msg => {
  const user = getUser(msg.senderId, msg.peerId);

  if (user.role == 1) return msg.send(`
     Список команд:
     !ник, !nick - установить себе ник      
     !стата, !статистика, !профиль, !stats - посмотреть статистику
     !изнас, !iznas - изнасиловать пользователя
     !послать - послать нахуй пользователя`);

  msg.send(`
      Помощь:
      Чтоб выдать варн/кик/бан необходимо ответить на сообщение пользователя, которому нужно выдать варн/кик/бан 

      Список команд:
      !кмд, !команды, !помощь - список команд
      !варн, !warn - выдать предупреждение пользователю
      !кик, !kick - выгнать пользователя из беседы (есть возможность вернуть)
      !бан, !ban - забанить пользователя в беседе (при возврате будет авто-кик)
      !разбан, !unban - разбанить пользователя
      !стата, !статистика, !профиль, !stats - посмотреть статистику
      !разварн, !анварн, !унварн, !unwarn - снять предупреждение с пользователя
      !изнас, !iznas - изнасиловать пользователя
      !послать, !fu, !fuckyou - послать нахуй пользователя
      !ид, !айди, !id - получить conversationId сообщения
      !адм, !админ, !admin - выдать/забрать админку в боте
      !настройки - разрешить/запретить отправлять медиа
      !ник, !nick - установить себе ник`);
});

console.log("started");
vk.updates.start().catch(console.error);