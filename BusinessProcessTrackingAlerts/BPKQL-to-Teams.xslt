<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:math="http://www.w3.org/2005/xpath-functions/math" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:dm="http://azure.workflow.datamapper" xmlns:ef="http://azure.workflow.datamapper.extensions" xmlns="http://www.w3.org/2005/xpath-functions" exclude-result-prefixes="xsl xs math dm ef" version="3.0" expand-text="yes">
  <xsl:output indent="yes" media-type="text/json" method="text" omit-xml-declaration="yes" />
  <xsl:template match="/">
    <xsl:variable name="xmlinput" select="json-to-xml(/)" />
    <xsl:variable name="xmloutput">
      <xsl:apply-templates select="$xmlinput" mode="azure.workflow.datamapper" />
    </xsl:variable>
    <xsl:value-of select="xml-to-json($xmloutput,map{'indent':true()})" />
  </xsl:template>
  <xsl:template match="/" mode="azure.workflow.datamapper">
    <array>
      <xsl:for-each select="/*/*[@key='value']/*">
        <map>
          <xsl:choose>
            <xsl:when test="local-name-from-QName(node-name(*[@key='eventName'])) = 'null'">
              <null key="Stage" />
            </xsl:when>
            <xsl:otherwise>
              <string key="Stage">{*[@key='eventName']}</string>
            </xsl:otherwise>
          </xsl:choose>
          <string key="Status">{dm:if_then_else((*[@key='eventStatus']) = ('success'), 'Success', 'Failure')}</string>
          <string key="DateTime">{replace(substring(*[@key='eventTimestamp'], 0, 20), 'T', ' ')}</string>
        </map>
      </xsl:for-each>
    </array>
  </xsl:template>
  <xsl:function name="dm:if_then_else" as="xs:string">
    <xsl:param name="condition" as="xs:boolean" />
    <xsl:param name="thenResult" as="xs:anyAtomicType?" />
    <xsl:param name="elseResult" as="xs:anyAtomicType?" />
    <xsl:choose>
      <xsl:when test="$condition">
        <xsl:value-of select="$thenResult" />
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$elseResult" />
      </xsl:otherwise>
    </xsl:choose>
  </xsl:function>
</xsl:stylesheet>