import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface InfoItem {
  region: string
  tag: string
  tagColor: 'rose' | 'emerald' | 'blue' | 'orange'
  stats: string
  title: string
  desc: string
  intentText: string
  img: string
}

const seasonData: Record<string, InfoItem[]> = {
  '春': [
    { region: "林芝", tag: "雪山桃花", tagColor: "rose", stats: "⭐ 春季必去", title: "西藏林芝桃花节", desc: "雪山脚下绵延百里的野生桃花林，中国最美春天。", intentText: "我想去林芝看桃花，请帮我规划一个春季赏花行程。", img: "/pic/林芝桃花.png" },
    { region: "婺源", tag: "徽派春色", tagColor: "emerald", stats: "⭐ 踏青首选", title: "江西婺源油菜花", desc: "白墙黛瓦的徽派建筑与漫山遍野的金色油菜花海交相辉映。", intentText: "计划去婺源看油菜花，体验徽州文化，请生成攻略。", img: "/pic/婺源油菜花.png" },
    { region: "扬州", tag: "烟花三月", tagColor: "blue", stats: "⭐ 江南水乡", title: "烟花三月下扬州", desc: "瘦西湖畔柳树依依，感受江南早春的温婉与诗意。", intentText: "想去扬州感受江南春景和早茶文化，请安排路线。", img: "/pic/三月扬州.png" },
    { region: "洛阳", tag: "花开时节", tagColor: "rose", stats: "⭐ 千年古都", title: "洛阳牡丹花会", desc: "唯有牡丹真国色，花开时节动京城。领略盛唐遗风。", intentText: "春天想去洛阳看牡丹并游览龙门石窟，请规划行程。", img: "/pic/洛阳牡丹.png" },
    { region: "杭州", tag: "西湖春晓", tagColor: "emerald", stats: "⭐ 诗意江南", title: "杭州西湖苏堤春晓", desc: "春风拂柳，漫步苏堤，品一杯明前龙井，感受江南柔情。", intentText: "打算春天去杭州西湖游玩，品尝龙井茶，需要一份慢节奏攻略。", img: "/pic/苏堤春晓.png" },
    { region: "大理", tag: "风花雪月", tagColor: "blue", stats: "⭐ 浪漫苍洱", title: "大理苍山洱海", desc: "面朝大海，春暖花开。在洱海边骑行，享受大理的阳光。", intentText: "想去大理环游洱海，看看春天的花，请帮我安排几天休闲游。", img: "/pic/苍山洱海.png" },
  ],
  '夏': [
    { region: "伊犁", tag: "绿色童话", tagColor: "emerald", stats: "⭐ 避暑胜地", title: "新疆伊犁那拉提草原", desc: "中国最美的立体草原，夏季气温凉爽，满眼皆是治愈的绿色。", intentText: "夏天想去新疆伊犁大草原避暑，需要一份自驾或包车规划。", img: "/pic/新疆伊犁那拉提草原.jpg" },
    { region: "青岛", tag: "海滨微风", tagColor: "blue", stats: "⭐ 啤酒海鲜", title: "青岛海滨夏日", desc: "红瓦绿树，碧海蓝天。吹海风、喝原浆啤酒、吃海鲜。", intentText: "夏天想去青岛看海吃海鲜，请帮我规划周末两日游。", img: "/pic/青岛海滨夏日.jpg" },
    { region: "长白山", tag: "清凉秘境", tagColor: "emerald", stats: "⭐ 森林氧吧", title: "吉林长白山天池", desc: "夏季平均气温22度，探秘神秘天池与原始森林。", intentText: "打算去长白山看天池和避暑，请提供路线建议。", img: "/pic/吉林长白山天池.jpg" },
    { region: "贵阳", tag: "爽爽凉夏", tagColor: "emerald", stats: "⭐ 避暑之都", title: "贵阳避暑之旅", desc: "被森林环抱的城市，夏日平均气温23度，感受喀斯特地貌奇观。", intentText: "夏天想去贵阳避暑吃酸汤鱼，并去周边看瀑布，请规划。", img: "/pic/贵阳避暑.jpg" },
    { region: "九寨沟", tag: "童话水世界", tagColor: "blue", stats: "⭐ 人间仙境", title: "九寨沟清凉一夏", desc: "九寨归来不看水，夏日的九寨沟翠海叠瀑，清凉幽静。", intentText: "计划夏天去九寨沟游玩，想了解最佳拍摄点和路线安排。", img: "/pic/九寨沟.jpg" },
    { region: "承德", tag: "皇家园林", tagColor: "orange", stats: "⭐ 历史名城", title: "承德避暑山庄", desc: "清代皇帝的夏日行宫，园林艺术与塞外风光的完美结合。", intentText: "想去承德避暑山庄和木兰围场，体验皇家避暑生活，请规划。", img: "/pic/承德避暑山庄.jpg" },
  ],
  '秋': [
    { region: "喀纳斯", tag: "上帝调色板", tagColor: "orange", stats: "⭐ 秋季绝景", title: "新疆阿勒泰喀纳斯", desc: "金黄的白桦林与翠绿的湖水交织，如梦如幻的秋日童话。", intentText: "想在秋天去喀纳斯看白桦林，请帮我规划阿勒泰地区的行程。", img: "/pic/新疆阿勒泰.jpg" },
    { region: "额济纳旗", tag: "金色苍茫", tagColor: "orange", stats: "⭐ 摄影天堂", title: "内蒙古额济纳胡杨林", desc: "三千年的守望，只为绚烂的二十天，极致的沙漠金秋。", intentText: "计划去额济纳旗看胡杨林，请结合周边安排行程。", img: "/pic/内蒙古.jpg" },
    { region: "南京", tag: "满城桂香", tagColor: "rose", stats: "⭐ 梧桐落叶", title: "金陵古都秋色", desc: "钟山风景区的梧桐大道，栖霞山的漫山红叶，秋意浓厚。", intentText: "秋天想去南京看梧桐和红叶，请规划一个文化与自然结合的路线。", img: "/pic/金陵秋色.jpg" },
    { region: "北京", tag: "红叶漫山", tagColor: "rose", stats: "⭐ 经典秋韵", title: "北京香山红叶", desc: "老舍笔下北平的秋天，长城内外层林尽染，漫山红遍。", intentText: "秋天想去北京看香山红叶和爬长城，请帮我安排几天行程。", img: "/pic/北京香山.jpg" },
    { region: "稻城亚丁", tag: "水蓝色星球", tagColor: "emerald", stats: "⭐ 净土寻秋", title: "稻城亚丁秋日童话", desc: "金色的草甸，神圣的雪山，这里是水蓝色星球上的最后一片净土。", intentText: "计划去稻城亚丁徒步看秋景，需要适应高反的详细攻略。", img: "/pic/稻城亚丁秋日.jpg" },
    { region: "塔川", tag: "徽派秋意", tagColor: "orange", stats: "⭐ 小众秘境", title: "安徽宏村塔川秋色", desc: "中国三大秋色之一，晨雾中的红叶与马头墙宛如一幅水墨画。", intentText: "想去安徽塔川看红叶，顺便游览宏村，请安排一条摄影路线。", img: "/pic/安徽宏村.jpg" },
  ],
  '冬': [
    { region: "哈尔滨", tag: "冰雪奇缘", tagColor: "blue", stats: "⭐ 顶流冰城", title: "哈尔滨冰雪大世界", desc: "璀璨的冰雕建筑，中央大街的异国风情，体验极致寒冬的快乐。", intentText: "冬天想去哈尔滨看冰雕、玩雪，请帮我安排抗寒游玩攻略。", img: "/pic/哈尔滨冰雪大世界.jpg" },
    { region: "三亚", tag: "温暖过冬", tagColor: "emerald", stats: "⭐ 避寒天堂", title: "海南三亚度假", desc: "告别寒冬，在椰风海韵中享受阳光沙滩和温暖的冬日。", intentText: "冬天想去三亚避寒度假，节奏要慢，请帮我规划。", img: "/pic/海南三亚.jpg" },
    { region: "阿勒泰", tag: "粉雪天堂", tagColor: "blue", stats: "⭐ 滑雪圣地", title: "新疆阿勒泰滑雪", desc: "人类滑雪起源地，拥有世界上最顶级的粉雪资源。", intentText: "我是滑雪爱好者，冬天想去阿勒泰将军山滑雪，请规划行程。", img: "/pic/新疆阿勒泰滑雪.jpg" },
    { region: "延吉", tag: "边城风情", tagColor: "rose", stats: "⭐ 美食打卡", title: "吉林延吉冬日漫游", desc: "不出国就能体验的韩剧浪漫，在雪地里吃一碗热腾腾的汤饭。", intentText: "冬天想去延吉打卡双语墙和吃朝鲜族美食，请规划攻略。", img: "/pic/吉林延吉.jpg" },
    { region: "西双版纳", tag: "热带雨林", tagColor: "emerald", stats: "⭐ 异域暖冬", title: "西双版纳暖冬之旅", desc: "穿越热带雨林，逛星光夜市，体验浓郁的傣族风情。", intentText: "想去西双版纳过冬，体验热带风情和夜市文化，请安排。", img: "/pic/西双版纳.jpg" },
    { region: "峨眉山", tag: "雪景温泉", tagColor: "blue", stats: "⭐ 佛国冰雪", title: "四川峨眉山冬韵", desc: "登金顶看云海日出，赏雾凇雪景，下山泡个舒舒服服的温泉。", intentText: "打算冬天去峨眉山看雪景和泡温泉，请帮我规划路线。", img: "/pic/四川峨眉山.jpg" },
  ],
}

const tagColors: Record<InfoItem['tagColor'], string> = {
  rose: 'bg-rose-500/20 text-rose-600',
  emerald: 'bg-emerald-500/20 text-emerald-600',
  blue: 'bg-blue-500/20 text-blue-600',
  orange: 'bg-orange-500/20 text-orange-600',
}

const seasonNames: Record<string, string> = { '春': '春日寻芳', '夏': '夏日清凉', '秋': '秋日斑斓', '冬': '冬日冰雪' }

export default function Information() {
  const navigate = useNavigate()
  const [season, setSeason] = useState('春')
  const [loading, setLoading] = useState(false)

  const changeSeason = (s: string) => {
    if (s === season) return
    setSeason(s)
    setLoading(true)
    setTimeout(() => setLoading(false), 400)
  }

  const importToPlanner = (region: string, intent: string) => {
    navigate(`/?region=${encodeURIComponent(region)}&intent=${encodeURIComponent(intent)}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-white">
      <header className="flex items-center justify-between px-6 py-4 bg-white/70 backdrop-blur border-b sticky top-0 z-10">
        <button onClick={() => navigate('/')} className="text-sm text-slate-500 hover:text-emerald-600">
          <i className="fa-solid fa-arrow-left mr-1" />返回规划台
        </button>
        <h1 className="font-bold text-lg">
          <i className="fa-solid fa-lightbulb text-amber-500 mr-2" />NaviMAS 灵感库
          <span className="ml-2 text-[10px] font-normal bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">本地数据引擎库</span>
        </h1>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <h2 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent">
          探索四季，预见世界
        </h2>

        <div className="flex justify-center gap-2 mb-8">
          {Object.keys(seasonData).map((s) => (
            <button
              key={s}
              onClick={() => changeSeason(s)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition ${
                season === s
                  ? 'bg-slate-800 text-white shadow-lg'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
              }`}
            >
              {seasonNames[s]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden shadow-sm border border-slate-100 bg-white animate-pulse">
                <div className="h-44 bg-slate-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-slate-200" />
                  <div className="h-3 w-full rounded bg-slate-100" />
                  <div className="h-8 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {seasonData[season].map((item, i) => (
              <div key={i} className="group rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-slate-100 bg-white animate-fade-in" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="relative h-44 overflow-hidden">
                  <img src={item.img} alt={item.title} className="h-full w-full object-cover group-hover:scale-105 transition duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent" />
                  <span className={`absolute top-3 left-3 text-xs rounded-full px-2.5 py-1 font-medium backdrop-blur ${tagColors[item.tagColor]}`}>{item.tag}</span>
                  <span className="absolute bottom-3 left-3 text-white font-bold text-sm drop-shadow">{item.region}</span>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-slate-800">{item.title}</h3>
                    <span className="text-[10px] text-amber-500">{item.stats}</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">{item.desc}</p>
                  <button
                    onClick={() => importToPlanner(item.region, item.intentText)}
                    className="w-full py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-cyan-500 hover:shadow-lg hover:shadow-emerald-500/30 transition"
                  >
                    <i className="fa-solid fa-wand-magic-sparkles mr-1" />导入 Agent 生成规划图谱
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
