/*
 * G7sim - Intel 8048 (MCS-48) instruction interpreter.
 * Faithful port of O2EM's cpu.c cpu_exec(). One call runs a full video frame.
 */
(function () {
  'use strict';
  var C = window.G7000.CONST;
  var LINECNT = C.LINECNT, VBLCLK = C.VBLCLK;
  var P = window.G7000.prototype;

  P.cpu_exec = function () {
    var self = this;
    var intRAM = this.intRAM;
    var rom;
    var op, adr, dat, temp;

    for (;;) {
      this.clk = 0;
      this.lastpc = this.pc;
      rom = this.rom;
      op = rom[this.pc & 0xfff];
      this.pc = (this.pc + 1) & 0xfff;
      var rp = this.reg_pnt;

      switch (op) {
        case 0x00: this.clk++; break; // NOP
        case 0x01: this.clk++; break; // ILL
        case 0x02: this.clk += 2; break; // OUTL BUS,A (undef)
        case 0x03: // ADD A,#data
          this.clk += 2; this.cy = this.ac = 0;
          dat = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff;
          if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40;
          temp = this.acc + dat; if (temp > 0xFF) this.cy = 1;
          this.acc = temp & 0xFF; break;
        case 0x04: this.pc = rom[this.pc & 0xfff] | this.A11; this.clk += 2; break; // JMP
        case 0x05: this.xirq_en = 1; this.clk++; break; // EN I
        case 0x06: this.clk++; break; // ILL
        case 0x07: this.acc = (this.acc - 1) & 0xFF; this.clk++; break; // DEC A
        case 0x08: this.clk += 2; this.acc = this.in_bus(); break; // INS A,BUS
        case 0x09: this.acc = this.p1; this.clk += 2; break; // IN A,P1
        case 0x0A: this.acc = this.read_P2(); this.clk += 2; break; // IN A,P2
        case 0x0B: this.clk++; break; // ILL
        case 0x0C: this.clk += 2; this.acc = this.read_PB(0); break; // MOVD A,P4
        case 0x0D: this.clk += 2; this.acc = this.read_PB(1); break;
        case 0x0E: this.clk += 2; this.acc = this.read_PB(2); break;
        case 0x0F: this.clk += 2; this.acc = this.read_PB(3); break;
        case 0x10: intRAM[intRAM[rp] & 0x3F]++; this.clk++; break; // INC @Ri
        case 0x11: intRAM[intRAM[rp + 1] & 0x3F]++; this.clk++; break;
        case 0x12: // JB0
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.acc & 0x01) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x13: // ADDC A,#data
          this.clk += 2; dat = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.ac = 0;
          if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40;
          temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1;
          this.acc = temp & 0xFF; break;
        case 0x14: // CALL
          this.make_psw(); adr = rom[this.pc & 0xfff] | this.A11; this.pc = (this.pc + 1) & 0xfff;
          this.clk += 2; this.push(this.pc & 0xFF); this.push(((this.pc & 0xF00) >> 8) | (this.psw & 0xF0));
          this.pc = adr; break;
        case 0x15: this.xirq_en = 0; this.clk++; break; // DIS I
        case 0x16: // JTF
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = this.t_flag ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff);
          this.t_flag = 0; break;
        case 0x17: this.acc = (this.acc + 1) & 0xFF; this.clk++; break; // INC A
        case 0x18: intRAM[rp]++; this.clk++; break; // INC Rr
        case 0x19: intRAM[rp + 1]++; this.clk++; break;
        case 0x1A: intRAM[rp + 2]++; this.clk++; break;
        case 0x1B: intRAM[rp + 3]++; this.clk++; break;
        case 0x1C: intRAM[rp + 4]++; this.clk++; break;
        case 0x1D: intRAM[rp + 5]++; this.clk++; break;
        case 0x1E: intRAM[rp + 6]++; this.clk++; break;
        case 0x1F: intRAM[rp + 7]++; this.clk++; break;
        case 0x20: this.clk++; dat = this.acc; this.acc = intRAM[intRAM[rp] & 0x3F]; intRAM[intRAM[rp] & 0x3F] = dat; break; // XCH A,@Ri
        case 0x21: this.clk++; dat = this.acc; this.acc = intRAM[intRAM[rp + 1] & 0x3F]; intRAM[intRAM[rp + 1] & 0x3F] = dat; break;
        case 0x22: this.clk++; break; // ILL
        case 0x23: this.clk += 2; this.acc = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; break; // MOV A,#data
        case 0x24: this.pc = rom[this.pc & 0xfff] | 0x100 | this.A11; this.clk += 2; break; // JMP
        case 0x25: this.tirq_en = 1; this.clk++; break; // EN TCNTI
        case 0x26: // JNT0
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (!this.get_voice_status()) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x27: this.clk++; this.acc = 0; break; // CLR A
        case 0x28: dat = this.acc; this.acc = intRAM[rp]; intRAM[rp] = dat; this.clk++; break; // XCH A,Rr
        case 0x29: dat = this.acc; this.acc = intRAM[rp + 1]; intRAM[rp + 1] = dat; this.clk++; break;
        case 0x2A: dat = this.acc; this.acc = intRAM[rp + 2]; intRAM[rp + 2] = dat; this.clk++; break;
        case 0x2B: dat = this.acc; this.acc = intRAM[rp + 3]; intRAM[rp + 3] = dat; this.clk++; break;
        case 0x2C: dat = this.acc; this.acc = intRAM[rp + 4]; intRAM[rp + 4] = dat; this.clk++; break;
        case 0x2D: dat = this.acc; this.acc = intRAM[rp + 5]; intRAM[rp + 5] = dat; this.clk++; break;
        case 0x2E: dat = this.acc; this.acc = intRAM[rp + 6]; intRAM[rp + 6] = dat; this.clk++; break;
        case 0x2F: dat = this.acc; this.acc = intRAM[rp + 7]; intRAM[rp + 7] = dat; this.clk++; break;
        case 0x30: // XCHD A,@Ri
          this.clk++; adr = intRAM[rp] & 0x3F; dat = this.acc & 0x0F; this.acc = this.acc & 0xF0;
          this.acc = this.acc | (intRAM[adr] & 0x0F); intRAM[adr] = (intRAM[adr] & 0xF0) | dat; break;
        case 0x31:
          this.clk++; adr = intRAM[rp + 1] & 0x3F; dat = this.acc & 0x0F; this.acc = this.acc & 0xF0;
          this.acc = this.acc | (intRAM[adr] & 0x0F); intRAM[adr] = (intRAM[adr] & 0xF0) | dat; break;
        case 0x32: // JB1
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.acc & 0x02) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x33: this.clk++; break; // ILL
        case 0x34: // CALL
          this.make_psw(); adr = rom[this.pc & 0xfff] | 0x100 | this.A11; this.pc = (this.pc + 1) & 0xfff;
          this.clk += 2; this.push(this.pc & 0xFF); this.push(((this.pc & 0xF00) >> 8) | (this.psw & 0xF0));
          this.pc = adr; break;
        case 0x35: this.tirq_en = 0; this.tirq_pend = 0; this.clk++; break; // DIS TCNTI
        case 0x36: // JT0
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = this.get_voice_status() ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x37: this.acc = this.acc ^ 0xFF; this.clk++; break; // CPL A
        case 0x38: this.clk++; break; // ILL
        case 0x39: this.clk += 2; this.write_p1(this.acc); break; // OUTL P1,A
        case 0x3A: this.clk += 2; this.p2 = this.acc; break; // OUTL P2,A
        case 0x3B: this.clk++; break; // ILL
        case 0x3C: this.clk += 2; this.write_PB(0, this.acc); break; // MOVD P4,A
        case 0x3D: this.clk += 2; this.write_PB(1, this.acc); break;
        case 0x3E: this.clk += 2; this.write_PB(2, this.acc); break;
        case 0x3F: this.clk += 2; this.write_PB(3, this.acc); break;
        case 0x40: this.clk++; this.acc |= intRAM[intRAM[rp] & 0x3F]; break; // ORL A,@Ri
        case 0x41: this.clk++; this.acc |= intRAM[intRAM[rp + 1] & 0x3F]; break;
        case 0x42: this.clk++; this.acc = this.itimer; break; // MOV A,T
        case 0x43: this.clk += 2; this.acc |= rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; break; // ORL A,#data
        case 0x44: this.pc = rom[this.pc & 0xfff] | 0x200 | this.A11; this.clk += 2; break; // JMP
        case 0x45: this.count_on = 1; this.clk++; break; // STRT CNT
        case 0x46: // JNT1
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (!this.read_t1()) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x47: this.clk++; dat = (this.acc & 0xF0) >> 4; this.acc = ((this.acc << 4) | dat) & 0xFF; break; // SWAP A
        case 0x48: this.clk++; this.acc |= intRAM[rp]; break; // ORL A,Rr
        case 0x49: this.clk++; this.acc |= intRAM[rp + 1]; break;
        case 0x4A: this.clk++; this.acc |= intRAM[rp + 2]; break;
        case 0x4B: this.clk++; this.acc |= intRAM[rp + 3]; break;
        case 0x4C: this.clk++; this.acc |= intRAM[rp + 4]; break;
        case 0x4D: this.clk++; this.acc |= intRAM[rp + 5]; break;
        case 0x4E: this.clk++; this.acc |= intRAM[rp + 6]; break;
        case 0x4F: this.clk++; this.acc |= intRAM[rp + 7]; break;
        case 0x50: this.acc &= intRAM[intRAM[rp] & 0x3F]; this.clk++; break; // ANL A,@Ri
        case 0x51: this.acc &= intRAM[intRAM[rp + 1] & 0x3F]; this.clk++; break;
        case 0x52: // JB2
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.acc & 0x04) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x53: this.clk += 2; this.acc &= rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; break; // ANL A,#data
        case 0x54: // CALL
          this.make_psw(); adr = rom[this.pc & 0xfff] | 0x200 | this.A11; this.pc = (this.pc + 1) & 0xfff;
          this.clk += 2; this.push(this.pc & 0xFF); this.push(((this.pc & 0xF00) >> 8) | (this.psw & 0xF0));
          this.pc = adr; break;
        case 0x55: this.timer_on = 1; this.clk++; break; // STRT T
        case 0x56: // JT1
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = this.read_t1() ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x57: // DA A
          this.clk++;
          if (((this.acc & 0x0F) > 0x09) || this.ac) { if (this.acc > 0xf9) this.cy = 1; this.acc = (this.acc + 6) & 0xFF; }
          dat = (this.acc & 0xF0) >> 4;
          if ((dat > 9) || this.cy) { dat += 6; this.cy = 1; }
          this.acc = ((this.acc & 0x0F) | (dat << 4)) & 0xFF; break;
        case 0x58: this.clk++; this.acc &= intRAM[rp]; break; // ANL A,Rr
        case 0x59: this.clk++; this.acc &= intRAM[rp + 1]; break;
        case 0x5A: this.clk++; this.acc &= intRAM[rp + 2]; break;
        case 0x5B: this.clk++; this.acc &= intRAM[rp + 3]; break;
        case 0x5C: this.clk++; this.acc &= intRAM[rp + 4]; break;
        case 0x5D: this.clk++; this.acc &= intRAM[rp + 5]; break;
        case 0x5E: this.clk++; this.acc &= intRAM[rp + 6]; break;
        case 0x5F: this.clk++; this.acc &= intRAM[rp + 7]; break;
        case 0x60: this.clk++; this.cy = this.ac = 0; dat = intRAM[intRAM[rp] & 0x3F];
          if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40; temp = this.acc + dat; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break; // ADD A,@Ri
        case 0x61: this.clk++; this.cy = this.ac = 0; dat = intRAM[intRAM[rp + 1] & 0x3F];
          if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40; temp = this.acc + dat; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x62: this.clk++; this.itimer = this.acc; break; // MOV T,A
        case 0x63: this.clk++; break; // ILL
        case 0x64: this.pc = rom[this.pc & 0xfff] | 0x300 | this.A11; this.clk += 2; break; // JMP
        case 0x65: this.clk++; this.count_on = this.timer_on = 0; break; // STOP TCNT
        case 0x66: this.clk++; break; // ILL
        case 0x67: dat = this.cy; this.cy = this.acc & 0x01; this.acc = this.acc >> 1; this.acc = dat ? (this.acc | 0x80) : (this.acc & 0x7F); this.clk++; break; // RRC A
        case 0x68: this.clk++; this.cy = this.ac = 0; dat = intRAM[rp]; if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40; temp = this.acc + dat; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break; // ADD A,Rr
        case 0x69: this.clk++; this.cy = this.ac = 0; dat = intRAM[rp + 1]; if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40; temp = this.acc + dat; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x6A: this.clk++; this.cy = this.ac = 0; dat = intRAM[rp + 2]; if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40; temp = this.acc + dat; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x6B: this.clk++; this.cy = this.ac = 0; dat = intRAM[rp + 3]; if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40; temp = this.acc + dat; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x6C: this.clk++; this.cy = this.ac = 0; dat = intRAM[rp + 4]; if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40; temp = this.acc + dat; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x6D: this.clk++; this.cy = this.ac = 0; dat = intRAM[rp + 5]; if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40; temp = this.acc + dat; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x6E: this.clk++; this.cy = this.ac = 0; dat = intRAM[rp + 6]; if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40; temp = this.acc + dat; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x6F: this.clk++; this.cy = this.ac = 0; dat = intRAM[rp + 7]; if (((this.acc & 0x0f) + (dat & 0x0f)) > 0x0f) this.ac = 0x40; temp = this.acc + dat; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x70: this.clk++; this.ac = 0; dat = intRAM[intRAM[rp] & 0x3F]; if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40; temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break; // ADDC A,@Ri
        case 0x71: this.clk++; this.ac = 0; dat = intRAM[intRAM[rp + 1] & 0x3F]; if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40; temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x72: // JB3
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.acc & 0x08) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x73: this.clk++; break; // ILL
        case 0x74: // CALL
          this.make_psw(); adr = rom[this.pc & 0xfff] | 0x300 | this.A11; this.pc = (this.pc + 1) & 0xfff;
          this.clk += 2; this.push(this.pc & 0xFF); this.push(((this.pc & 0xF00) >> 8) | (this.psw & 0xF0));
          this.pc = adr; break;
        case 0x75: this.clk++; break; // EN CLK (undef)
        case 0x76: // JF1
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = this.f1 ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x77: this.clk++; dat = this.acc & 0x01; this.acc = this.acc >> 1; this.acc = dat ? (this.acc | 0x80) : (this.acc & 0x7f); break; // RR A
        case 0x78: this.clk++; this.ac = 0; dat = intRAM[rp]; if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40; temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break; // ADDC A,Rr
        case 0x79: this.clk++; this.ac = 0; dat = intRAM[rp + 1]; if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40; temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x7A: this.clk++; this.ac = 0; dat = intRAM[rp + 2]; if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40; temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x7B: this.clk++; this.ac = 0; dat = intRAM[rp + 3]; if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40; temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x7C: this.clk++; this.ac = 0; dat = intRAM[rp + 4]; if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40; temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x7D: this.clk++; this.ac = 0; dat = intRAM[rp + 5]; if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40; temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x7E: this.clk++; this.ac = 0; dat = intRAM[rp + 6]; if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40; temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x7F: this.clk++; this.ac = 0; dat = intRAM[rp + 7]; if (((this.acc & 0x0f) + (dat & 0x0f) + this.cy) > 0x0f) this.ac = 0x40; temp = this.acc + dat + this.cy; this.cy = 0; if (temp > 0xFF) this.cy = 1; this.acc = temp & 0xFF; break;
        case 0x80: this.acc = this.ext_read(intRAM[rp]); this.clk += 2; break; // MOVX A,@Ri
        case 0x81: this.acc = this.ext_read(intRAM[rp + 1]); this.clk += 2; break;
        case 0x82: this.clk++; break; // ILL
        case 0x83: this.clk += 2; this.pc = (this.pull() & 0x0F) << 8; this.pc = this.pc | this.pull(); break; // RET
        case 0x84: this.pc = rom[this.pc & 0xfff] | 0x400 | this.A11; this.clk += 2; break; // JMP
        case 0x85: this.clk++; this.f0 = 0; break; // CLR F0
        case 0x86: // JNI
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.int_clk > 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x87: this.clk++; break; // ILL
        case 0x88: this.clk += 2; break; // ORL BUS,#data (undef)
        case 0x89: this.write_p1(this.p1 | rom[this.pc & 0xfff]); this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break; // ORL P1,#data
        case 0x8A: this.p2 = this.p2 | rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break; // ORL P2,#data
        case 0x8B: this.clk++; break; // ILL
        case 0x8C: this.write_PB(0, this.read_PB(0) | this.acc); this.clk += 2; break; // ORLD P4,A
        case 0x8D: this.write_PB(1, this.read_PB(1) | this.acc); this.clk += 2; break;
        case 0x8E: this.write_PB(2, this.read_PB(2) | this.acc); this.clk += 2; break;
        case 0x8F: this.write_PB(3, this.read_PB(3) | this.acc); this.clk += 2; break;
        case 0x90: this.ext_write(this.acc, intRAM[rp]); this.clk += 2; break; // MOVX @Ri,A
        case 0x91: this.ext_write(this.acc, intRAM[rp + 1]); this.clk += 2; break;
        case 0x92: // JB4
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.acc & 0x10) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x93: // RETR
          this.clk += 2; dat = this.pull(); this.pc = (dat & 0x0F) << 8;
          this.cy = (dat & 0x80) >> 7; this.ac = dat & 0x40; this.f0 = dat & 0x20; this.bs = dat & 0x10;
          this.reg_pnt = this.bs ? 24 : 0; this.pc = this.pc | this.pull();
          this.irq_ex = 0; this.A11 = this.A11ff; break;
        case 0x94: // CALL
          this.make_psw(); adr = rom[this.pc & 0xfff] | 0x400 | this.A11; this.pc = (this.pc + 1) & 0xfff;
          this.clk += 2; this.push(this.pc & 0xFF); this.push(((this.pc & 0xF00) >> 8) | (this.psw & 0xF0));
          this.pc = adr; break;
        case 0x95: this.f0 = this.f0 ^ 0x20; this.clk++; break; // CPL F0
        case 0x96: // JNZ
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.acc !== 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0x97: this.cy = 0; this.clk++; break; // CLR C
        case 0x98: this.clk += 2; break; // ANL BUS,#data (undef)
        case 0x99: this.write_p1(this.p1 & rom[this.pc & 0xfff]); this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break; // ANL P1,#data
        case 0x9A: this.p2 = this.p2 & rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break; // ANL P2,#data
        case 0x9B: this.clk++; break; // ILL
        case 0x9C: this.write_PB(0, this.read_PB(0) & this.acc); this.clk += 2; break; // ANLD P4,A
        case 0x9D: this.write_PB(1, this.read_PB(1) & this.acc); this.clk += 2; break;
        case 0x9E: this.write_PB(2, this.read_PB(2) & this.acc); this.clk += 2; break;
        case 0x9F: this.write_PB(3, this.read_PB(3) & this.acc); this.clk += 2; break;
        case 0xA0: intRAM[intRAM[rp] & 0x3F] = this.acc; this.clk++; break; // MOV @Ri,A
        case 0xA1: intRAM[intRAM[rp + 1] & 0x3F] = this.acc; this.clk++; break;
        case 0xA2: this.clk++; break; // ILL
        case 0xA3: this.acc = rom[((this.pc & 0xF00) | this.acc) & 0xfff]; this.clk += 2; break; // MOVP A,@A
        case 0xA4: this.pc = rom[this.pc & 0xfff] | 0x500 | this.A11; this.clk += 2; break; // JMP
        case 0xA5: this.clk++; this.f1 = 0; break; // CLR F1
        case 0xA6: this.clk++; break; // ILL
        case 0xA7: this.cy = this.cy ^ 0x01; this.clk++; break; // CPL C
        case 0xA8: intRAM[rp] = this.acc; this.clk++; break; // MOV Rr,A
        case 0xA9: intRAM[rp + 1] = this.acc; this.clk++; break;
        case 0xAA: intRAM[rp + 2] = this.acc; this.clk++; break;
        case 0xAB: intRAM[rp + 3] = this.acc; this.clk++; break;
        case 0xAC: intRAM[rp + 4] = this.acc; this.clk++; break;
        case 0xAD: intRAM[rp + 5] = this.acc; this.clk++; break;
        case 0xAE: intRAM[rp + 6] = this.acc; this.clk++; break;
        case 0xAF: intRAM[rp + 7] = this.acc; this.clk++; break;
        case 0xB0: intRAM[intRAM[rp] & 0x3F] = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break; // MOV @Ri,#data
        case 0xB1: intRAM[intRAM[rp + 1] & 0x3F] = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break;
        case 0xB2: // JB5
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.acc & 0x20) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xB3: adr = (this.pc & 0xF00) | this.acc; this.pc = (this.pc & 0xF00) | rom[adr & 0xfff]; this.clk += 2; break; // JMPP @A
        case 0xB4: // CALL
          this.make_psw(); adr = rom[this.pc & 0xfff] | 0x500 | this.A11; this.pc = (this.pc + 1) & 0xfff;
          this.clk += 2; this.push(this.pc & 0xFF); this.push(((this.pc & 0xF00) >> 8) | (this.psw & 0xF0));
          this.pc = adr; break;
        case 0xB5: this.f1 = this.f1 ^ 0x01; this.clk++; break; // CPL F1
        case 0xB6: // JF0
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = this.f0 ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xB7: this.clk++; break; // ILL
        case 0xB8: intRAM[rp] = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break; // MOV Rr,#data
        case 0xB9: intRAM[rp + 1] = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break;
        case 0xBA: intRAM[rp + 2] = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break;
        case 0xBB: intRAM[rp + 3] = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break;
        case 0xBC: intRAM[rp + 4] = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break;
        case 0xBD: intRAM[rp + 5] = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break;
        case 0xBE: intRAM[rp + 6] = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break;
        case 0xBF: intRAM[rp + 7] = rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; this.clk += 2; break;
        case 0xC0: this.clk++; break; // ILL
        case 0xC1: this.clk++; break;
        case 0xC2: this.clk++; break;
        case 0xC3: this.clk++; break;
        case 0xC4: this.pc = rom[this.pc & 0xfff] | 0x600 | this.A11; this.clk += 2; break; // JMP
        case 0xC5: this.bs = this.reg_pnt = 0; this.clk++; break; // SEL RB0
        case 0xC6: // JZ
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.acc === 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xC7: this.clk++; this.make_psw(); this.acc = this.psw; break; // MOV A,PSW
        case 0xC8: intRAM[rp]--; this.clk++; break; // DEC Rr
        case 0xC9: intRAM[rp + 1]--; this.clk++; break;
        case 0xCA: intRAM[rp + 2]--; this.clk++; break;
        case 0xCB: intRAM[rp + 3]--; this.clk++; break;
        case 0xCC: intRAM[rp + 4]--; this.clk++; break;
        case 0xCD: intRAM[rp + 5]--; this.clk++; break;
        case 0xCE: intRAM[rp + 6]--; this.clk++; break;
        case 0xCF: intRAM[rp + 7]--; this.clk++; break;
        case 0xD0: this.acc ^= intRAM[intRAM[rp] & 0x3F]; this.clk++; break; // XRL A,@Ri
        case 0xD1: this.acc ^= intRAM[intRAM[rp + 1] & 0x3F]; this.clk++; break;
        case 0xD2: // JB6
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.acc & 0x40) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xD3: this.clk += 2; this.acc ^= rom[this.pc & 0xfff]; this.pc = (this.pc + 1) & 0xfff; break; // XRL A,#data
        case 0xD4: // CALL
          this.make_psw(); adr = rom[this.pc & 0xfff] | 0x600 | this.A11; this.pc = (this.pc + 1) & 0xfff;
          this.clk += 2; this.push(this.pc & 0xFF); this.push(((this.pc & 0xF00) >> 8) | (this.psw & 0xF0));
          this.pc = adr; break;
        case 0xD5: this.bs = 0x10; this.reg_pnt = 24; this.clk++; break; // SEL RB1
        case 0xD6: this.clk++; break; // ILL
        case 0xD7: // MOV PSW,A
          this.psw = this.acc; this.clk++;
          this.cy = (this.psw & 0x80) >> 7; this.ac = this.psw & 0x40; this.f0 = this.psw & 0x20; this.bs = this.psw & 0x10;
          this.reg_pnt = this.bs ? 24 : 0; this.sp = ((this.psw & 0x07) << 1) + 8; break;
        case 0xD8: this.acc ^= intRAM[rp]; this.clk++; break; // XRL A,Rr
        case 0xD9: this.acc ^= intRAM[rp + 1]; this.clk++; break;
        case 0xDA: this.acc ^= intRAM[rp + 2]; this.clk++; break;
        case 0xDB: this.acc ^= intRAM[rp + 3]; this.clk++; break;
        case 0xDC: this.acc ^= intRAM[rp + 4]; this.clk++; break;
        case 0xDD: this.acc ^= intRAM[rp + 5]; this.clk++; break;
        case 0xDE: this.acc ^= intRAM[rp + 6]; this.clk++; break;
        case 0xDF: this.acc ^= intRAM[rp + 7]; this.clk++; break;
        case 0xE0: this.clk++; break; // ILL
        case 0xE1: this.clk++; break;
        case 0xE2: this.clk++; break;
        case 0xE3: adr = 0x300 | this.acc; this.acc = rom[adr & 0xfff]; this.clk += 2; break; // MOVP3 A,@A
        case 0xE4: this.pc = rom[this.pc & 0xfff] | 0x700 | this.A11; this.clk += 2; break; // JMP
        case 0xE5: this.A11 = 0; this.A11ff = 0; this.clk++; break; // SEL MB0
        case 0xE6: // JNC
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (!this.cy) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xE7: this.clk++; dat = this.acc & 0x80; this.acc = (this.acc << 1) & 0xFF; this.acc = dat ? (this.acc | 0x01) : (this.acc & 0xFE); break; // RL A
        case 0xE8: this.clk += 2; intRAM[rp]--; dat = rom[this.pc & 0xfff]; this.pc = (intRAM[rp] !== 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break; // DJNZ
        case 0xE9: this.clk += 2; intRAM[rp + 1]--; dat = rom[this.pc & 0xfff]; this.pc = (intRAM[rp + 1] !== 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xEA: this.clk += 2; intRAM[rp + 2]--; dat = rom[this.pc & 0xfff]; this.pc = (intRAM[rp + 2] !== 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xEB: this.clk += 2; intRAM[rp + 3]--; dat = rom[this.pc & 0xfff]; this.pc = (intRAM[rp + 3] !== 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xEC: this.clk += 2; intRAM[rp + 4]--; dat = rom[this.pc & 0xfff]; this.pc = (intRAM[rp + 4] !== 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xED: this.clk += 2; intRAM[rp + 5]--; dat = rom[this.pc & 0xfff]; this.pc = (intRAM[rp + 5] !== 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xEE: this.clk += 2; intRAM[rp + 6]--; dat = rom[this.pc & 0xfff]; this.pc = (intRAM[rp + 6] !== 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xEF: this.clk += 2; intRAM[rp + 7]--; dat = rom[this.pc & 0xfff]; this.pc = (intRAM[rp + 7] !== 0) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xF0: this.clk++; this.acc = intRAM[intRAM[rp] & 0x3F]; break; // MOV A,@Ri
        case 0xF1: this.clk++; this.acc = intRAM[intRAM[rp + 1] & 0x3F]; break;
        case 0xF2: // JB7
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = (this.acc & 0x80) ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xF3: this.clk++; break; // ILL
        case 0xF4: // CALL
          this.clk += 2; this.make_psw(); adr = rom[this.pc & 0xfff] | 0x700 | this.A11; this.pc = (this.pc + 1) & 0xfff;
          this.push(this.pc & 0xFF); this.push(((this.pc & 0xF00) >> 8) | (this.psw & 0xF0)); this.pc = adr; break;
        case 0xF5: // SEL MB1
          if (this.irq_ex) { this.A11ff = 0x800; } else { this.A11 = 0x800; this.A11ff = 0x800; } this.clk++; break;
        case 0xF6: // JC
          this.clk += 2; dat = rom[this.pc & 0xfff];
          this.pc = this.cy ? ((this.pc & 0xF00) | dat) : ((this.pc + 1) & 0xfff); break;
        case 0xF7: dat = this.cy; this.cy = (this.acc & 0x80) >> 7; this.acc = (this.acc << 1) & 0xFF; this.acc = dat ? (this.acc | 0x01) : (this.acc & 0xFE); this.clk++; break; // RLC A
        case 0xF8: this.clk++; this.acc = intRAM[rp]; break; // MOV A,Rr
        case 0xF9: this.clk++; this.acc = intRAM[rp + 1]; break;
        case 0xFA: this.clk++; this.acc = intRAM[rp + 2]; break;
        case 0xFB: this.clk++; this.acc = intRAM[rp + 3]; break;
        case 0xFC: this.clk++; this.acc = intRAM[rp + 4]; break;
        case 0xFD: this.clk++; this.acc = intRAM[rp + 5]; break;
        case 0xFE: this.clk++; this.acc = intRAM[rp + 6]; break;
        case 0xFF: this.clk++; this.acc = intRAM[rp + 7]; break;
      }

      var clk = this.clk;
      this.master_clk += clk;
      this.h_clk += clk;
      this.clk_counter += clk;

      if (this.int_clk > clk) this.int_clk -= clk; else this.int_clk = 0;

      if (this.xirq_pend) this.ext_IRQ();
      if (this.tirq_pend) this.tim_IRQ();

      if (this.h_clk > LINECNT - 1) {
        this.h_clk -= LINECNT;
        if (this.enahirq && (this.VDCwrite[0xA0] & 0x01)) this.ext_IRQ();
        if (this.count_on && this.mstate === 0) {
          this.itimer = (this.itimer + 1) & 0xFF;
          if (this.itimer === 0) { this.t_flag = 1; this.tim_IRQ(); this.draw_region(); }
        }
      }

      if (this.timer_on) {
        this.master_count += clk;
        if (this.master_count > 31) {
          this.master_count -= 31;
          this.itimer = (this.itimer + 1) & 0xFF;
          if (this.itimer === 0) { this.t_flag = 1; this.tim_IRQ(); }
        }
      }

      if (this.mstate === 0 && this.master_clk > VBLCLK) this.handle_vbl();

      if (this.mstate === 1 && this.master_clk > this.evblclk) {
        this.handle_evbl();
        break;
      }
    }
  };
})();
