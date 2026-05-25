Component({
  options: {
    multipleSlots: false
  },

  properties: {
    name: {
      type: String,
      value: '' // camera|chat|diy|design|helicopter|map|miles|shopping|variant|critterpedia
    },
    size: {
      type: Number,
      value: 48 // rpx
    }
  },

  data: {
    iconPath: ''
  },

  observers: {
    'name': function (name) {
      if (!name) return;
      const path = '/assets/icons/icon-' + name + '.svg';
      this.setData({ iconPath: path });
    }
  },

  lifetimes: {
    attached: function () {
      const name = this.properties.name;
      if (name) {
        this.setData({ iconPath: '/assets/icons/icon-' + name + '.svg' });
      }
    }
  }
});
