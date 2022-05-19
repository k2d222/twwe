import { MapInfo } from '../server/protocol'

export class Lobby {
  cont: HTMLElement
  mapList: HTMLElement
  btnJoin: HTMLButtonElement
  btnRefresh: HTMLButtonElement

  constructor(cont: HTMLElement) {
    this.cont = cont
    this.mapList = cont.querySelector('.list')
    this.btnJoin = cont.querySelector('button.join')
    this.btnRefresh = cont.querySelector('button.refresh')
  }

  chooseMap(mapInfos: MapInfo[]): Promise<string> {
    // sort by [users desc, name asc]
    mapInfos = mapInfos.sort((a, b) => {
      if (a.users === b.users) {
        return a.name.localeCompare(b.name)
      }
      else {
        return b.users - a.users
      }
    })

    return new Promise(resolve => {
      this.mapList.innerHTML = ''

      let selected = ''

      for (const info of mapInfos) {
        const $row = document.createElement('div')
        $row.classList.add('row')
        this.mapList.append($row)

        const $btn = document.createElement('input')
        $btn.type = 'radio'
        $btn.name = 'map'
        $btn.onchange = () => selected = info.name

        const $name = document.createElement('span')
        $name.classList.add('name')
        $name.innerText = info.name

        const $users = document.createElement('span')
        $users.classList.add('users')
        $users.innerText = '' + info.users

        $row.append($btn, $name, $users)
      }

      // check the first one
      this.cont.querySelector('input').checked = true
      selected = mapInfos[0].name

      this.btnJoin.onclick = () => {
        this.cont.classList.add('hidden')
        resolve(selected)
      }
      this.cont.classList.remove('hidden')
    })
  }
}
