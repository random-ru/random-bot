import { User } from '@prisma/client'
import { TrustAPI } from '@shared/api/trust'
import { TrustAPIException } from '@shared/api/trust/exceptions'
import { GetTrustAnalyticsPayload } from '@shared/api/trust/requests'
import { TrustAnalytics, TrustVerdict } from '@shared/api/trust/types'
import { prisma } from '@shared/db'
import { env } from '@shared/env'
import { createMemoryCache } from '@shared/lib/cache'
import { Bot, Context, InlineKeyboard } from 'grammy'
import { ChatMember, User as TelegramUser } from 'grammy/types'
import { z } from 'zod'

const userCache = createMemoryCache<User>({
  ttl: 1000 * 60 * 60 * 6, // 6 hours
})

async function getUser(telegramId: number): Promise<User | null> {
  const cached = userCache.get(telegramId)

  if (cached) {
    return cached
  }

  const user = await prisma.user.findUnique({
    where: { telegramId: String(telegramId) },
  })

  if (user) {
    userCache.set(telegramId, user)
  }

  return user
}

async function createUser(
  telegramUser: TelegramUser,
  extend?: { restricted?: boolean; telegramIsAdmin?: boolean },
): Promise<User> {
  const user = await prisma.user.create({
    data: {
      telegramId: String(telegramUser.id),
      telegramUsername: telegramUser.username,
      telegramFirstName: telegramUser.first_name,
      telegramLastName: telegramUser.last_name,
      restricted: extend?.restricted,
      telegramIsAdmin: extend?.telegramIsAdmin,
    },
  })

  userCache.set(telegramUser.id, user)

  return user
}

async function updateUser(
  telegramId: number,
  data: Partial<User>,
): Promise<User> {
  const user = await prisma.user.update({
    where: { telegramId: String(telegramId) },
    data,
  })

  userCache.set(telegramId, user)

  return user
}

async function deleteUser(telegramId: number) {
  await prisma.user.delete({
    where: { telegramId: String(telegramId) },
  })

  userCache.delete(telegramId)
}

async function unblockUser(user: User) {
  await bot.api.restrictChatMember(
    `@${env.telegram.chatUsername}`,
    Number(user.telegramId),
    {
      can_send_messages: true,
      can_send_other_messages: true,
      can_invite_users: true,
      can_send_polls: true,
      can_add_web_page_previews: true,
    },
  )

  await updateUser(Number(user.telegramId), { restricted: false })
}

function generateUserLink(
  telegramUser: TelegramUser,
  label = [telegramUser.first_name, telegramUser.last_name]
    .filter(Boolean)
    .join(' '),
): string {
  return `[${label}](tg://user?id=${telegramUser.id})`
}

function generateTrustAnalyticsSummary(trustAnalytics: TrustAnalytics): string {
  const { verdict, accuracy } = trustAnalytics

  return `Verdict: ${verdict}, Accuracy: ${Math.round(accuracy)}%`
}

function isAdmin(chatMember: ChatMember): boolean {
  return (
    chatMember.status === 'creator' || chatMember.status === 'administrator'
  )
}

async function sendLog(
  text: string | string[],
  other: { keyboard?: InlineKeyboard } = {},
) {
  const fullText = Array.isArray(text) ? text.join('\n') : text

  await bot.api.sendMessage(env.telegram.logChannelId, fullText, {
    parse_mode: 'Markdown',
    reply_markup: other.keyboard,
  })
}

function printJSON(object: unknown) {
  console.info(JSON.stringify(object))
}

const bot = new Bot(env.telegram.botApiToken)

const ConfigSchema = z.object({
  removeMessages: z.boolean().default(true),
  checkTrust: z.boolean().default(true),
})

const config: z.infer<typeof ConfigSchema> = {
  removeMessages: true,
  checkTrust: true,
}

const disallowedVerdicts = [TrustVerdict.AwfulStage, TrustVerdict.BadStage]

bot.on('message', async (ctx) => {
  const { text, from, chat } = ctx.message

  if (
    chat.type !== 'supergroup' ||
    chat.username !== env.telegram.chatUsername
  ) {
    return
  }

  const isJoinEvent = Boolean(ctx.message.new_chat_members)
  const isLeftEvent = Boolean(ctx.message.left_chat_member)

  if (isJoinEvent) {
    console.info(`User ${from.id} joined, only removing the message`)
    await ctx.deleteMessage()
    return
  }

  if (isLeftEvent) {
    console.info(`User ${from.id} left, skipping`)
    return
  }

  const user = await getUser(from.id)

  if (user) {
    if (user.restricted) {
      await ctx.deleteMessage()
      return
    }

    if (text?.startsWith('/random ') && user.telegramIsAdmin) {
      const [, command, ...args] = text.split(' ')
      return handleCommand(ctx, command, args)
    }

    return // already checked
  }

  try {
    const chatMember = await ctx.getChatMember(from.id)
    console.info('Checking new user')
    printJSON(chatMember)

    if (isAdmin(chatMember)) {
      await createUser(from, { telegramIsAdmin: true })
      return
    }

    let trustAnalytics: TrustAnalytics | null = null

    if (config.checkTrust) {
      const payload: GetTrustAnalyticsPayload = {
        telegramId: from.id,
      }

      if (!isJoinEvent) {
        payload.messageId = ctx.message.message_id
      }

      try {
        console.info('Calculating TrustAnalytics')
        printJSON(payload)
        trustAnalytics = await TrustAPI.getTrustAnalytics(payload)
        console.info('TrustAnalytics calculated')
        printJSON(trustAnalytics)

        const isAllowedVerdict = !disallowedVerdicts.includes(
          trustAnalytics.verdict,
        )

        if (isAllowedVerdict) {
          await createUser(from)
          return
        }
      } catch (error) {
        const errorDetails =
          error instanceof TrustAPIException
            ? `Code: \`${error.code}\``
            : 'Неизвестная ошибка'

        await sendLog([
          `Не удалось получить TrustAnalytics`,
          `Payload: \`${JSON.stringify(payload)}\``,
          errorDetails,
        ])

        console.info('Failed to calculate TrustAnalytics')
        console.error(error)
      }
    }

    await ctx.restrictChatMember(from.id, { can_send_messages: false })
    await createUser(from, { restricted: true })
    console.info(`The user ${from.id} has been restricted`)

    const message = [
      `Выдал read-only ${generateUserLink(from)} (\`${from.id}\`)`,
      !trustAnalytics && `*Проверка через TrustAPI не пройдена*`,
      trustAnalytics && generateTrustAnalyticsSummary(trustAnalytics),
    ]
      .filter(Boolean)
      .join('\n')

    const keyboard = new InlineKeyboard().text(
      'Разблокировать',
      `unblock ${from.id}`,
    )

    await sendLog(message, { keyboard })

    try {
      await ctx.forwardMessage(env.telegram.logChannelId)
    } catch {
      console.info('Failed to forward message')
    }

    if (config.removeMessages) {
      await ctx.deleteMessage()
    }

    if (!trustAnalytics) {
      await ctx.reply(
        `${generateUserLink(from)}, для снятия read-only напиши админу`,
        { parse_mode: 'Markdown' },
      )
    }
  } catch (error) {
    console.info(`Failed to process message from ${from.id}`)
    console.error(error)
  }
})

const TelegramIdSchema = z.string().regex(/\d+/).transform(Number)

const TelegramIdOrSourceSchema = z.union([TelegramIdSchema, z.literal('reply')])

const UserCommandSchema = z.object({
  command: z.literal('user'),
  args: z.tuple([
    z.enum(['unblock', 'delete', 'trust']),
    TelegramIdOrSourceSchema,
  ]),
})

const BanCommandSchema = z.object({
  command: z.literal('ban'),
  args: z.tuple([z.literal('restricted')]),
})

const AnalyzeCommandSchema = z.object({
  command: z.literal('analyze'),
  args: z.tuple([TelegramIdOrSourceSchema]),
})

const CheckCommandSchema = z.object({
  command: z.literal('check'),
  args: z.tuple([TelegramIdOrSourceSchema]),
})

const ConfigCommandSchema = z.object({
  command: z.literal('config'),
  args: z.union([
    z.tuple([z.literal('view')]),
    z.tuple([z.literal('set'), z.string()]),
  ]),
})

const CacheCommandSchema = z.object({
  command: z.literal('cache'),
  args: z.tuple([z.literal('clear')]),
})

const CommandSchema = z.discriminatedUnion('command', [
  UserCommandSchema,
  BanCommandSchema,
  AnalyzeCommandSchema,
  CheckCommandSchema,
  ConfigCommandSchema,
  CacheCommandSchema,
])

async function getTelegramId(
  ctx: Context,
  telegramIdOrSource: z.infer<typeof TelegramIdOrSourceSchema>,
): Promise<number> {
  if (typeof telegramIdOrSource === 'number') {
    return telegramIdOrSource
  }

  const replyId = ctx.message?.reply_to_message?.from?.id

  if (!replyId) {
    await ctx.reply('Не удалось определить Telegram ID')
    throw new Error('Telegram ID not found')
  }

  return replyId
}

async function handleCommand(ctx: Context, command: string, args: string[]) {
  const parse = CommandSchema.safeParse({ command, args })

  if (!parse.success) {
    await ctx.reply(
      `Неверный формат команды: \`${JSON.stringify(parse.error.issues)}\``,
      { parse_mode: 'Markdown' },
    )

    return
  }

  if (parse.data.command === 'user') {
    const [action, telegramIdOrSource] = parse.data.args
    const telegramId = await getTelegramId(ctx, telegramIdOrSource)

    if (action === 'unblock') {
      const user = await getUser(telegramId)

      if (!user) {
        await ctx.reply('Пользователь не найден')
        return
      }

      if (!user.restricted) {
        await ctx.reply('У пользователя нет ограничений на отправку сообщений')
        return
      }

      await unblockUser(user)
      await ctx.reply('Ограничения сняты')
    }

    if (action === 'delete') {
      const user = await getUser(telegramId)

      if (!user) {
        await ctx.reply('Пользователь не найден')
        return
      }

      await deleteUser(telegramId)
      await ctx.reply('Пользователь удален')
    }

    if (action === 'trust') {
      const existingUser = await getUser(telegramId)

      if (existingUser) {
        await ctx.reply('Пользователь уже существует')
        return
      }

      const chatMember = await ctx.getChatMember(telegramId)

      await createUser(chatMember.user, {
        telegramIsAdmin: isAdmin(chatMember),
      })

      await ctx.reply('Пользователь добавлен в базу')
    }
  }

  if (parse.data.command === 'ban') {
    const [action] = parse.data.args

    if (action === 'restricted') {
      const users = await prisma.user.findMany({
        where: { restricted: true },
      })

      for (const user of users) {
        await ctx.banChatMember(Number(user.telegramId))
      }

      await ctx.reply('Все ранее добавленные в read-only чмони забанены')
    }
  }

  if (parse.data.command === 'analyze') {
    const [telegramIdOrSource] = parse.data.args
    const telegramId = await getTelegramId(ctx, telegramIdOrSource)

    const messageId =
      telegramIdOrSource === 'reply'
        ? ctx.message?.reply_to_message?.message_id
        : undefined

    const payload = {
      telegramId,
      messageId,
    }

    try {
      await ctx.reply(
        `Начинаю расчет TrustAnalytics для: \`${JSON.stringify(payload)}\``,
        { parse_mode: 'Markdown' },
      )

      console.info('Calculating TrustAnalytics')
      printJSON(payload)
      const trustAnalytics = await TrustAPI.getTrustAnalytics(payload)
      console.info('TrustAnalytics calculated')
      printJSON(trustAnalytics)

      await ctx.reply(
        `TrustAnalytics:

\`\`\`json
${JSON.stringify(trustAnalytics, null, 2)}
\`\`\``,
        { parse_mode: 'Markdown' },
      )
    } catch (error) {
      const errorDetails =
        error instanceof TrustAPIException
          ? `Code: \`${error.code}\``
          : 'Неизвестная ошибка'

      const message = [
        `Не удалось получить TrustAnalytics`,
        `Payload: \`${JSON.stringify(payload)}\``,
        errorDetails,
      ].join('\n')

      await ctx.reply(message, { parse_mode: 'Markdown' })
      console.error(error)
    }
  }

  if (parse.data.command === 'check') {
    const [telegramIdOrSource] = parse.data.args
    const telegramId = await getTelegramId(ctx, telegramIdOrSource)

    const messageId =
      telegramIdOrSource === 'reply'
        ? ctx.message?.reply_to_message?.message_id
        : undefined

    const payload = {
      telegramId,
      messageId,
    }

    try {
      console.info('Calculating TrustAnalytics')
      printJSON(payload)
      const trustAnalytics = await TrustAPI.getTrustAnalytics(payload)
      console.info('TrustAnalytics calculated')
      printJSON(trustAnalytics)

      const isAllowedVerdict = !disallowedVerdicts.includes(
        trustAnalytics.verdict,
      )

      const { user } = await bot.api.getChatMember(
        `@${env.telegram.chatUsername}`,
        telegramId,
      )

      const existingUser = await getUser(telegramId)

      if (!existingUser) {
        await createUser(user)
      }

      if (isAllowedVerdict) {
        await ctx.reply('Юзер проверен')
        return
      }

      await ctx.restrictChatMember(user.id, { can_send_messages: false })
      await updateUser(user.id, { restricted: true })
      console.info(`The user ${user.id} has been restricted`)

      const message = [
        `Выдал read-only ${generateUserLink(user)} (\`${user.id}\`)`,
        !trustAnalytics && `*Проверка через TrustAPI не пройдена*`,
        trustAnalytics && generateTrustAnalyticsSummary(trustAnalytics),
      ]
        .filter(Boolean)
        .join('\n')

      const keyboard = new InlineKeyboard().text(
        'Разблокировать',
        `unblock ${user.id}`,
      )

      await sendLog(message, { keyboard })

      if (messageId) {
        try {
          await bot.api.forwardMessage(
            env.telegram.logChannelId,
            `@${env.telegram.chatUsername}`,
            messageId,
          )
        } catch {
          console.info('Failed to forward message')
        }
      }

      await ctx.deleteMessage()

      if (config.removeMessages && messageId) {
        await bot.api.deleteMessage(`@${env.telegram.chatUsername}`, messageId)
      }
    } catch (error) {
      const errorDetails =
        error instanceof TrustAPIException
          ? `Code: \`${error.code}\``
          : 'Неизвестная ошибка'

      const message = [
        `Не удалось проверить юзера`,
        `Payload: \`${JSON.stringify(payload)}\``,
        errorDetails,
      ].join('\n')

      await ctx.reply(message, { parse_mode: 'Markdown' })
      console.error(error)
    }
  }

  if (parse.data.command === 'config') {
    const args = parse.data.args

    if (args[0] === 'view') {
      await ctx.reply(`Конфиг: \`${JSON.stringify(config)}\``, {
        parse_mode: 'Markdown',
      })
    } else if (args[0] === 'set') {
      try {
        const updatedConfig = ConfigSchema.parse(JSON.parse(args[1]))
        Object.assign(config, updatedConfig)
        await ctx.reply(`Конфиг обновлен: \`${JSON.stringify(config)}\``, {
          parse_mode: 'Markdown',
        })
      } catch {
        await ctx.reply('Неверный формат конфига')
      }
    }
  }

  if (parse.data.command === 'cache') {
    const [action] = parse.data.args

    if (action === 'clear') {
      userCache.clear()
      await ctx.reply('Господин, кэш очищен')
    }
  }
}

const UnblockQuerySchema = z.tuple([z.literal('unblock'), TelegramIdSchema])

bot.on('callback_query:data', async (ctx) => {
  const queryArgs = ctx.callbackQuery.data.split(' ')
  const parse = UnblockQuerySchema.safeParse(queryArgs)

  if (!parse.success) {
    await ctx.answerCallbackQuery('Неизвестная команда')
    return
  }

  const caller = await getUser(ctx.callbackQuery.from.id)

  if (!caller?.telegramIsAdmin) {
    await ctx.answerCallbackQuery('Недостаточно прав')
    return
  }

  const [command, ...args] = parse.data

  try {
    if (command === 'unblock') {
      const telegramId = args[0]
      const user = await getUser(telegramId)

      if (!user) {
        await ctx.answerCallbackQuery('Пользователь не найден')
        return
      }

      if (!user.restricted) {
        await ctx.answerCallbackQuery(
          'У пользователя нет ограничений на отправку сообщений',
        )
        return
      }

      await unblockUser(user)
      await ctx.answerCallbackQuery('Ограничения сняты')
    }
  } catch (error) {
    console.log(error)
    await ctx.answerCallbackQuery('Не удалось выполнить команду')
  }
})

bot.catch((error) => {
  console.error(error)
})

void bot.start()
