import type { Lares4Command } from '../index';

function encode(e: string): number[] {
  const t: number[] = [];
  let n = 0;
  while (n < e.length) {
    let r = e.charCodeAt(n);
    if (r < 128) {
      t.push(r);
    } else {
      if (r < 2048) {
        t.push(192 | (r >> 6), 128 | (63 & r));
      } else {
        if (r < 55296 || r >= 57344) {
          t.push(224 | (r >> 12), 128 | ((r >> 6) & 63), 128 | (63 & r));
        } else {
          n += 1;
          r = 65536 + ((1023 & r) << 10 | (1023 & e.charCodeAt(n)));
          t.push(240 | (r >> 18), 128 | ((r >> 12) & 63), 128 | ((r >> 6) & 63), 128 | (63 & r));
        }
      }
    }
    n += 1;
  }
  return t;
}

function crc(e: string): string {
  const i = encode(e);
  const l = e.lastIndexOf('"CRC_16"') + '"CRC_16"'.length + (i.length - e.length);
  let r = 65535;
  let s = 0;

  while (s < l) {
    let t = 128;
    const o = i[s];
    while (t) {
      const n = (32768 & r) ? 1 : 0;
      r <<= 1;
      r &= 65535;
      if (o & t) {
        r += 1;
      }
      if (n) {
        r ^= 4129;
      }
      t >>= 1;
    }
    s += 1;
  }

  return "0x" + r.toString(16).padStart(4, '0').toUpperCase();
}

export class Lares4CommandFactory {
  private _login_id: string = '';
  private _cmd_id: number = 1;
  private _pin: string = '';
  private _sender: string = '';

  constructor(
    private readonly sender: string, 
    private readonly pin: string
  ) {
    this._sender = sender;
    this._pin = pin;
  }

  public get get_pin() {
    return this._pin;
  }

  public get get_sender() {
    return this._sender;
  }

  public get get_login_id() {
    return this._login_id;
  }

  public set set_login_id(value: string) {
    this._login_id = value;
  }

  public get get_last_cmd_id() {
    return this._cmd_id;
  }

  public get get_next_cmd_id() {
    return this._cmd_id++;
  }

  private build_payload(payload: Lares4Command['PAYLOAD']) {
    return {
      ...payload,
      ...(payload?.ID_LOGIN && { ID_LOGIN: this.get_login_id }),
      ...(payload?.PIN && { PIN: this.get_pin }),
    }
  }

  public build_cmd(cmd: string, payload_type: string, payload: Lares4Command['PAYLOAD']): Lares4Command {
    const timestamp: number = Math.trunc(Date.now() / 1000) - 1;

    const cmd_body = {
      SENDER: this._sender,
      RECEIVER: '',
      CMD: cmd,
      ID: `${this.get_next_cmd_id}`,
      PAYLOAD_TYPE: payload_type,
      PAYLOAD: this.build_payload(payload),
      TIMESTAMP: `${timestamp}`,
      CRC_16: '0x0000'
    };

    cmd_body.CRC_16 = crc(JSON.stringify(cmd_body));

    return cmd_body
  }
}
