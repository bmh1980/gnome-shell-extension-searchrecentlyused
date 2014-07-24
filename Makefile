GETTEXT_PACKAGE = searchrecentlyused
PACKAGE_NAME    = gnome-shell-extension-$(GETTEXT_PACKAGE)
PACKAGE_VERSION = 12
EXTENSION_UUID  = $(GETTEXT_PACKAGE)@bmh1980de.gmail.com

DATADIR ?= /usr/share

ifeq ($(shell id -u),0)
	EXTENSIONDIR = $(DATADIR)/gnome-shell/extensions/$(EXTENSION_UUID)
else
	EXTENSIONDIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
endif

all:
	@echo "dist      : create a source archive"
	@echo "extension : create an extension archive"
	@echo "install   : install the extension"

clean:
	rm -rf $(PACKAGE_NAME)-$(PACKAGE_VERSION)

dist:
	set -e; \
	mkdir $(PACKAGE_NAME)-$(PACKAGE_VERSION); \
	cp -ra extension.js metadata.json Makefile \
		$(PACKAGE_NAME)-$(PACKAGE_VERSION); \
	if [ -d .git ]; then \
		git log > $(PACKAGE_NAME)-$(PACKAGE_VERSION)/ChangeLog; \
	fi; \
	tar -c --xz -f $(PACKAGE_NAME)-$(PACKAGE_VERSION).tar.xz \
		$(PACKAGE_NAME)-$(PACKAGE_VERSION)

extension:
	zip $(EXTENSION_UUID).zip extension.js metadata.json

install:
	set -e; \
	mkdir -p $(DESTDIR)$(EXTENSIONDIR); \
	cp -a extension.js metadata.json $(DESTDIR)$(EXTENSIONDIR)

