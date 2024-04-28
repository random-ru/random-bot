import { randomInt } from 'crypto'
import path from 'path'
import {
  Document,
  Font,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import { TrustAnalytics, TrustVerdict } from '@shared/api/trust/types'
import { toUpperCaseFirst } from '@shared/lib/strings'
import { ChatMember } from 'grammy/types'

const FONT_PT_SANS = 'PT Sans'
const FONT_PT_SANS_NARROW = 'PT Sans Narrow'
const FONT_ROBOTO = 'Roboto'
const FONT_TINOS = 'Tinos'

Font.register({
  family: FONT_TINOS,
  src: path.join(process.cwd(), 'assets', 'Tinos-Bold.ttf'),
  fontWeight: 'bold',
})
Font.register({
  family: FONT_ROBOTO,
  src: path.join(process.cwd(), 'assets', 'Roboto-Regular.ttf'),
  fontWeight: 'normal',
})
Font.register({
  family: FONT_PT_SANS,
  src: path.join(process.cwd(), 'assets', 'PTSans-Regular.ttf'),
  fontWeight: 'normal',
})
Font.register({
  family: FONT_PT_SANS,
  src: path.join(process.cwd(), 'assets', 'PTSans-Bold.ttf'),
  fontWeight: 'bold',
})
Font.register({
  family: FONT_PT_SANS_NARROW,
  src: path.join(process.cwd(), 'assets', 'PTSansNarrow-Regular.ttf'),
})
Font.registerEmojiSource({
  format: 'png',
  url: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/',
})

const VerdictColors: Record<TrustVerdict, string> = {
  AwfulStage: 'red',
  BadStage: 'darkred',
  LowerStage: 'indianred',
  GoodStage: 'yellow',
  PerfectStage: 'lawngreen',
  VerifiedStage: 'mediumpurple',
  CertifiedStage: 'mediumpurple',
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#fff',
    margin: '1cm',
  },
  logoWrapper: {
    width: '13cm',
    alignItems: 'center',
    marginBottom: 10,
  },
  logo: { width: 140 },
  verdictBigWrapper: {
    position: 'absolute',
    borderWidth: 3,
    borderStyle: 'solid',
    paddingHorizontal: 4,
  },
  verdictBig: {
    fontSize: 36,
    fontFamily: FONT_TINOS,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  userProfile: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 32,
    marginTop: 20,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    marginRight: 12,
  },
  userInfo: { height: 56, justifyContent: 'space-evenly' },
  fullName: { fontFamily: FONT_ROBOTO, fontSize: 16, lineHeight: 1 },
  userID: { fontFamily: FONT_PT_SANS, fontSize: 14, lineHeight: 1 },
  username: { fontFamily: FONT_PT_SANS, fontSize: 14, lineHeight: 1 },
  sectionTitle: {
    fontFamily: FONT_PT_SANS,
    fontSize: 20,
    lineHeight: 1,
    fontWeight: 'bold',
    textAlign: 'center',
    width: '13cm',
    marginBottom: 14,
  },
  table: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    width: '13cm',
    marginBottom: 24,
  },
  col: {
    alignItems: 'center',
  },
  summaryHeaderCell: {
    fontFamily: FONT_PT_SANS,
    fontSize: 14,
    lineHeight: 1,
    marginBottom: 6,
  },
  summaryBodyCell: {
    fontFamily: FONT_PT_SANS,
    fontSize: 18,
    lineHeight: 1,
    fontWeight: 'bold',
  },
  factorsTable: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '13cm',
    marginBottom: 24,
  },
  factorsCol: {
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  factorsColRight: {
    alignItems: 'flex-end',
  },
  factorsHeaderCell: {
    fontFamily: FONT_PT_SANS,
    fontSize: 14,
    lineHeight: 1,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  factorsBodyCell: {
    fontFamily: FONT_PT_SANS,
    fontSize: 14,
    lineHeight: 1,
    marginBottom: 4,
  },
  alignLeft: {
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  eSigWrapper: {
    width: '13cm',
    alignItems: 'center',
    marginTop: 30,
  },
  eSig: {
    borderWidth: 2,
    borderColor: '#4c40d2',
    borderStyle: 'solid',
    borderRadius: 10,
    width: 230,
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  eSigStamp: {
    width: 40,
    marginRight: 3,
    flexBasis: 40,
    flexShrink: 0,
    flexGrow: 0,
  },
  eSigData: {},
  eSigTitle: {
    fontFamily: FONT_PT_SANS_NARROW,
    color: '#4c40d2',
    fontSize: 12,
    lineHeight: 1.1,
  },
  eSigInfo: {
    fontFamily: FONT_PT_SANS_NARROW,
    color: '#4c40d2',
    fontSize: 12,
    lineHeight: 1.1,
  },
})

interface ReportDocumentProps {
  user: ChatMember
  trustAnalytics: TrustAnalytics
  profilePic: ArrayBuffer
  contextId: string
}
const ReportDocument = ({
  trustAnalytics,
  user,
  profilePic,
  contextId,
}: ReportDocumentProps) => {
  const {
    factors,
    trust_score,
    mod_trust_score,
    verdict,
    report_creation_date,
    issuer,
  } = trustAnalytics
  const maxScore = factors.reduce((acc, curr) => acc + curr.max_score, 0)
  const generationDateString = new Date(
    report_creation_date * 1000,
  ).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    timeStyle: 'short',
    dateStyle: 'short',
  })
  const fullName = [user.user.first_name, user.user.last_name].join(' ').trim()
  const verdictShort = verdict.replace(/Stage/i, '')
  const stampRotateDegree = randomInt(30, 40)
  const stampTop = randomInt(65, 75)
  const stampRight = randomInt(40, 50)

  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View
          style={[
            styles.verdictBigWrapper,
            {
              borderColor: VerdictColors[verdict],
              transform: `rotate(-${stampRotateDegree}deg)`,
              top: stampTop,
              right: stampRight,
            },
          ]}
        >
          <Text
            style={[
              styles.verdictBig,
              {
                color: VerdictColors[verdict],
              },
            ]}
          >
            {verdictShort}
          </Text>
        </View>
        <View style={styles.logoWrapper}>
          <Image
            src={'https://trust-tg-app.0xf6.moe/logo-group.png'}
            style={styles.logo}
          />
        </View>
        <View style={styles.userProfile}>
          <Image src={Buffer.from(profilePic)} style={styles.avatar} />
          <View style={styles.userInfo}>
            <Text style={styles.fullName}>{fullName}</Text>
            <Text style={styles.userID}>ID: {user.user.id}</Text>
            <Text style={styles.username}>
              {user.user.username && '@'}
              {user.user.username}
            </Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.table}>
          <View style={styles.col}>
            <Text style={styles.summaryHeaderCell}>Verdict</Text>
            <Text
              style={[
                styles.summaryBodyCell,
                {
                  color: VerdictColors[verdict],
                },
              ]}
            >
              {verdictShort}
            </Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.summaryHeaderCell}>TrustFactor</Text>
            <Text style={styles.summaryBodyCell}>
              {trust_score}+({mod_trust_score})/{maxScore}
            </Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Factors</Text>
        <View style={styles.factorsTable}>
          <View style={styles.factorsCol}>
            <Text style={[styles.factorsHeaderCell, styles.alignLeft]}>
              Sampler
            </Text>
            {factors.map((factor) => (
              <Text
                key={factor.sampler}
                style={[styles.factorsBodyCell, styles.alignLeft]}
              >
                {toUpperCaseFirst(factor.sampler)}
              </Text>
            ))}
          </View>
          <View style={[styles.factorsCol, styles.factorsColRight]}>
            <Text style={styles.factorsHeaderCell}>Score</Text>
            {factors.map((factor) => (
              <Text key={factor.sampler} style={styles.factorsBodyCell}>
                {factor.score}
              </Text>
            ))}
          </View>
          <View style={[styles.factorsCol, styles.factorsColRight]}>
            <Text style={styles.factorsHeaderCell}>Max Score</Text>
            {factors.map((factor) => (
              <Text key={factor.sampler} style={styles.factorsBodyCell}>
                {factor.max_score}
              </Text>
            ))}
          </View>
        </View>
        <View style={styles.eSigWrapper}>
          <View style={styles.eSig}>
            <Image style={styles.eSigStamp} src={'assets/stamp.png'} />
            <View style={styles.eSigData}>
              <Text style={styles.eSigTitle}>
                Document is e-Signed with certificate:
              </Text>
              <Text style={styles.eSigInfo}>{issuer.id}</Text>
              <Text style={styles.eSigInfo}>Context: {contextId}</Text>
              <Text style={styles.eSigInfo}>Date: {generationDateString}</Text>
              <Text style={styles.eSigInfo}>Report ID: {issuer.report_id}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
export function createReportPDF(
  trustAnalytics: TrustAnalytics,
  chatMember: ChatMember,
  profilePic: ArrayBuffer,
  contextId: string,
) {
  return renderToBuffer(
    <ReportDocument
      trustAnalytics={trustAnalytics}
      user={chatMember}
      profilePic={profilePic}
      contextId={contextId}
    />,
  )
}
