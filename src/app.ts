import { User } from '@prisma/client'
import { TrustAPI } from '@shared/api/trust'
import { TrustVerdict } from '@shared/api/trust/types'
import { prisma } from '@shared/db'
import { env } from '@shared/env'
import { createMemoryCache } from '@shared/lib/cache'
import { Bot, Context } from 'grammy'
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

function generateUserLink(
  telegramUser: TelegramUser,
  label = [telegramUser.first_name, telegramUser.last_name]
    .filter(Boolean)
    .join(' '),
): string {
  return `[${label}](tg://user?id=${telegramUser.id})`
}

function isAdmin(chatMember: ChatMember): boolean {
  return (
    chatMember.status === 'creator' || chatMember.status === 'administrator'
  )
}

const bot = new Bot(env.telegram.botApiToken)

bot.on('message', async (ctx) => {
  const { text, from, chat } = ctx.message

  if (
    chat.type !== 'supergroup' ||
    chat.username !== env.telegram.chatUsername
  ) {
    return
  }

  const user = await getUser(from.id)

  if (user) {
    if (text?.startsWith('/random ') && user.telegramIsAdmin) {
      const [, command, ...args] = text.split(' ')
      return handleCommand(ctx, command, args)
    }

    if (user.restricted) {
      await ctx.deleteMessage()
    }

    return // already checked
  }

  try {
    const chatMember = await ctx.getChatMember(from.id)
    console.info('Checking new user')
    console.info(chatMember)

    if (isAdmin(chatMember)) {
      await createUser(from, { telegramIsAdmin: true })
      return
    }

    let trustChecked = false

    try {
      const payload = {
        telegramId: from.id,
        messageId: ctx.message.message_id,
      }

      console.info('Calculating TrustAnalytics for:', payload)
      const trustAnalytics = await TrustAPI.getTrustAnalytics(payload)
      console.info('TrustAnalytics calculated')
      console.info(trustAnalytics)

      const allowedVerdicts = [
        TrustVerdict.GoodStage,
        TrustVerdict.PerfectStage,
        TrustVerdict.LowerStage,
      ]

      if (allowedVerdicts.includes(trustAnalytics.verdict)) {
        await createUser(from)
        return
      }

      trustChecked = true
    } catch (error) {
      console.info('Failed to calculate TrustAnalytics')
      console.error(error)
    }

    await ctx.restrictChatMember(from.id, { can_send_messages: false })
    await createUser(from, { restricted: true })
    await ctx.deleteMessage()
    console.info(`The user ${from.id} has been restricted`)

    const userLink = generateUserLink(from, 'чмоне')

    const message = [
      `Выдал read-only ${userLink}`,
      !trustChecked && `*Проверка через TrustAPI не пройдена*`,
      `Разблокировать: \`/random user unblock ${from.id}\``,
    ]
      .filter(Boolean)
      .join('\n')

    await ctx.reply(message, { parse_mode: 'Markdown' })
  } catch (error) {
    console.info(`Failed to process message from ${from.id}`)
    console.error(error)
  }
})

const TelegramIdSchema = z.union([
  z.string().regex(/\d+/).transform(Number),
  z.literal('reply'),
])

const UserSchema = z.object({
  command: z.literal('user'),
  args: z.tuple([z.enum(['unblock', 'delete', 'trust']), TelegramIdSchema]),
})

const CacheSchema = z.object({
  command: z.literal('cache'),
  args: z.tuple([z.literal('clear')]),
})

const CommandSchema = z.discriminatedUnion('command', [UserSchema, CacheSchema])

async function getTelegramId(
  ctx: Context,
  telegramIdOrSource: z.infer<typeof TelegramIdSchema>,
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

      await ctx.restrictChatMember(telegramId, {
        can_send_messages: true,
        can_send_other_messages: true,
        can_invite_users: true,
        can_send_polls: true,
        can_add_web_page_previews: true,
      })

      await updateUser(telegramId, { restricted: false })
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

  if (parse.data.command === 'cache') {
    const [action] = parse.data.args

    if (action === 'clear') {
      userCache.clear()
      await ctx.reply('Кэш очищен')
    }
  }
}

bot.catch((error) => {
  console.error(error)
})

void bot.start()
